/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
/**
 * Cloudflare Worker: Feedback Analyzer
 * 
 * - Fetches feedback from D1 database
 * - Aggregates counts by source
 * - Runs AI analysis on feedback (Workers AI)
 * - Returns JSON response
 */
interface D1Database {
  prepare: (sql: string) => {
    all: () => Promise<{ results?: any[] }>;
  };
}

interface AiBinding {
  run: (model: string, options: { prompt: string; max_tokens?: number }) => Promise<any>;
}

interface Env {
  D1_FEEDBACK: D1Database;
  AI: AiBinding;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API endpoint for AI analysis
    if (url.pathname === '/api/analyze') {
      return handleAnalyze(env);
    }

    // Main dashboard page
    return handleDashboard(env);
  }
} satisfies ExportedHandler<Env>;

async function handleDashboard(env: Env): Promise<Response> {
  // Fetch feedback quickly
  let feedback: any[] = [];
  try {
    const { results } = await env.D1_FEEDBACK
      .prepare("SELECT id, source, message, timestamp FROM feedback")
      .all();
    feedback = results ?? [];
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch feedback from D1", details: err }),
      { status: 500 }
    );
  }

  // Count by source
  const countsBySource = feedback.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cloudflare Feedback Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7f9; color: #111; }
    
    .container { max-width: 1400px; margin: 0 auto; padding: 0 20px; }
    
    header { background: white; border-bottom: 1px solid #e5e7eb; margin-bottom: 32px; padding: 24px 0; }
    h1 { font-size: 28px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: #666; }
    
    .section { background: white; border-radius: 16px; padding: 28px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #111; padding-bottom: 12px; border-bottom: 2px solid #f6f7f9; }
    
    .filters-grid { display: grid; gap: 24px; margin-bottom: 24px; }
    .filter-group { }
    .filter-label { font-size: 13px; font-weight: 600; color: #666; margin-bottom: 10px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
    
    .nav { display: flex; gap: 8px; flex-wrap: wrap; }
    .nav button { background: white; color: #333; border: 2px solid #e5e7eb; border-radius: 999px; padding: 10px 18px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s; }
    .nav button:hover { border-color: #f6821f; background: #fff7f0; }
    .nav button.active { background: #f6821f; color: white; border-color: #f6821f; }
    
    .controls { display: flex; gap: 12px; align-items: center; padding-top: 20px; border-top: 1px solid #f6f7f9; margin-top: 20px; }
    .btn-clear { background: #6b7280; color: white; border: none; border-radius: 999px; padding: 10px 20px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s; }
    .btn-clear:hover { background: #4b5563; }
    
    .loading-indicator { display: flex; align-items: center; gap: 12px; background: #fff7f0; padding: 16px 20px; border-radius: 12px; border-left: 4px solid #f6821f; margin-bottom: 20px; }
    .spinner { width: 20px; height: 20px; border: 3px solid #fcd9b6; border-top: 3px solid #f6821f; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .loading-text { font-weight: 500; color: #92400e; }
    
    .feedback-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .feedback-count { font-size: 14px; color: #666; font-weight: 500; }
    
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 12px; transition: all 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #d1d5db; }
    .meta { font-size: 13px; color: #6b7280; margin-bottom: 12px; display: flex; gap: 12px; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .tags { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .tag { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
    .tag-theme { background: #eff6ff; color: #1e40af; }
    .tag-sentiment-Positive { background: #f0fdf4; color: #15803d; }
    .tag-sentiment-Neutral { background: #f9fafb; color: #4b5563; }
    .tag-sentiment-Negative { background: #fef2f2; color: #dc2626; }
    .tag-urgency-High { background: #fef2f2; color: #dc2626; }
    .tag-urgency-Medium { background: #fef9c3; color: #a16207; }
    .tag-urgency-Low { background: #f0fdf4; color: #15803d; }
    .message { color: #111; line-height: 1.6; }
    
    .hidden { display: none; }
    
    .empty-state { text-align: center; padding: 60px 20px; color: #6b7280; }
    .empty-state-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .empty-state-title { font-size: 18px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    .empty-state-text { font-size: 14px; color: #6b7280; }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>Feedback Dashboard</h1>
      <div class="subtitle">Tawann Alvarez</div>
    </div>
  </header>

  <div class="container">
    <div id="ai-loading" class="loading-indicator">
      <div class="spinner"></div>
      <div class="loading-text">Analyzing feedback with AI...</div>
    </div>

    <div class="section">
      <h2 class="section-title">Filters</h2>
      
      <div class="filters-grid">
        <div class="filter-group">
          <label class="filter-label">Source</label>
          <div class="nav" id="nav-source"></div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Theme</label>
          <div class="nav" id="nav-theme">
            <button class="inactive">Loading themes...</button>
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Sentiment</label>
          <div class="nav" id="nav-sentiment">
            <button class="inactive">Loading...</button>
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Urgency</label>
          <div class="nav" id="nav-urgency">
            <button class="inactive">Loading...</button>
          </div>
        </div>
      </div>

      <div class="controls">
        <button id="clear-filters" class="btn-clear">Clear All Filters</button>
      </div>
    </div>

    <div class="section">
      <div class="feedback-header">
        <h2 class="section-title" style="margin-bottom: 0;">Feedback</h2>
        <div class="feedback-count" id="feedback-count"></div>
      </div>
      <div id="content"></div>
    </div>
  </div>

  <script>
    const feedback = ${JSON.stringify(feedback)};
    const counts = ${JSON.stringify(countsBySource)};
    let aiSummary = [];
    
    const content = document.getElementById("content");
    const navSource = document.getElementById("nav-source");
    const navTheme = document.getElementById("nav-theme");
    const navSentiment = document.getElementById("nav-sentiment");
    const navUrgency = document.getElementById("nav-urgency");
    const aiLoading = document.getElementById("ai-loading");
    const clearFiltersBtn = document.getElementById("clear-filters");

    clearFiltersBtn.onclick = function() {
      activeFilters.source = [];
      activeFilters.theme = [];
      activeFilters.sentiment = [];
      activeFilters.urgency = [];
      updateActiveButtons();
      render();
    };

    let activeFilters = {
      source: [],
      theme: [],
      sentiment: [],
      urgency: []
    };

    function render() {
      content.innerHTML = "";
      const isLoading = aiSummary.length === 0;
      
      let filtered = feedback;
      
      // If filters are selected, apply them
      if (activeFilters.source.length > 0) {
        filtered = filtered.filter(function(f) {
          return activeFilters.source.includes(f.source);
        });
      }
      
      if (!isLoading) {
        if (activeFilters.theme.length > 0) {
          filtered = filtered.filter(function(f) {
            const summary = aiSummary.find(function(a) { return a.id === f.id; });
            return summary && activeFilters.theme.includes(summary.theme);
          });
        }
        
        if (activeFilters.sentiment.length > 0) {
          filtered = filtered.filter(function(f) {
            const summary = aiSummary.find(function(a) { return a.id === f.id; });
            return summary && activeFilters.sentiment.includes(summary.sentiment);
          });
        }
        
        if (activeFilters.urgency.length > 0) {
          filtered = filtered.filter(function(f) {
            const summary = aiSummary.find(function(a) { return a.id === f.id; });
            return summary && activeFilters.urgency.includes(summary.urgency);
          });
        }
      }

      // Update feedback count
      const feedbackCountEl = document.getElementById("feedback-count");
      if (feedbackCountEl) {
        feedbackCountEl.textContent = "Showing " + filtered.length + " of " + feedback.length + " items";
      }

      filtered.forEach(function(item) {
        const summary = aiSummary.find(function(a) { return a.id === item.id; }) || { theme: "Unknown", sentiment: "Neutral", urgency: "Medium" };
        const card = document.createElement("div");
        card.className = "card";
        
        let tagsHTML = '';
        if (isLoading) {
          tagsHTML = '<div class="tags"><span class="tag tag-theme">Loading...</span></div>';
        } else {
          tagsHTML = '<div class="tags">' +
            '<span class="tag tag-theme">' + summary.theme + '</span>' +
            '<span class="tag tag-sentiment-' + summary.sentiment + '">' + summary.sentiment + '</span>' +
            '<span class="tag tag-urgency-' + summary.urgency + '">' + summary.urgency + '</span>' +
            '</div>';
        }
        
        card.innerHTML = 
          '<div class="meta">' +
            '<span class="meta-item">📍 ' + item.source + '</span>' +
            '<span class="meta-item">🕒 ' + new Date(item.timestamp).toLocaleString() + '</span>' +
          '</div>' +
          tagsHTML +
          '<div class="message">' + item.message + '</div>';
        
        content.appendChild(card);
      });
      
      if (filtered.length === 0) {
        const hasActiveFilters = activeFilters.source.length > 0 || 
                                 activeFilters.theme.length > 0 || 
                                 activeFilters.sentiment.length > 0 || 
                                 activeFilters.urgency.length > 0;
        
        if (hasActiveFilters) {
          content.innerHTML = '<div class="empty-state">' +
            '<div class="empty-state-icon">🔍</div>' +
            '<div class="empty-state-title">No feedback matches your filters</div>' +
            '<div class="empty-state-text">Try adjusting or clearing your filters to see more results</div>' +
            '</div>';
        } else {
          content.innerHTML = '<div class="empty-state">' +
            '<div class="empty-state-icon">📭</div>' +
            '<div class="empty-state-title">No feedback available</div>' +
            '<div class="empty-state-text">There is no feedback to display at this time</div>' +
            '</div>';
        }
      }
    }

    function addButton(container, label, count, filterType, filterValue) {
      const btn = document.createElement("button");
      btn.textContent = count !== undefined ? label + ' (' + count + ')' : label;
      btn.dataset.filterType = filterType;
      btn.dataset.filterValue = filterValue;
      
      btn.onclick = function() {
        const index = activeFilters[filterType].indexOf(filterValue);
        
        if (index === -1) {
          activeFilters[filterType].push(filterValue);
        } else {
          activeFilters[filterType].splice(index, 1);
        }
        
        updateActiveButtons();
        render();
      };
      
      container.appendChild(btn);
      return btn;
    }

    function addAllButton(container, filterType, allValues) {
      const btn = document.createElement("button");
      btn.textContent = "All (" + feedback.length + ")";
      btn.dataset.filterType = filterType;
      btn.dataset.filterValue = "ALL_BUTTON";
      
      btn.onclick = function() {
        const allSelected = allValues.length > 0 && allValues.every(function(val) {
          return activeFilters[filterType].includes(val);
        });
        
        if (allSelected) {
          activeFilters[filterType] = [];
        } else {
          activeFilters[filterType] = allValues.slice();
        }
        
        updateActiveButtons();
        render();
      };
      
      container.appendChild(btn);
      return btn;
    }

    function updateActiveButtons() {
      [navSource, navTheme, navSentiment, navUrgency].forEach(function(container) {
        Array.from(container.children).forEach(function(btn) {
          const filterType = btn.dataset.filterType;
          const filterValue = btn.dataset.filterValue;
          
          if (filterValue === "ALL_BUTTON") {
            const allButtons = Array.from(container.children).filter(function(b) {
              return b.dataset.filterValue !== "ALL_BUTTON";
            });
            const allValues = allButtons.map(function(b) { return b.dataset.filterValue; });
            const allSelected = allValues.length > 0 && allValues.every(function(val) {
              return activeFilters[filterType].includes(val);
            });
            btn.className = allSelected ? "active" : "";
          } else if (activeFilters[filterType] && activeFilters[filterType].includes(filterValue)) {
            btn.className = "active";
          } else {
            btn.className = "";
          }
        });
      });
    }

    function initializeFilters() {
      navSource.innerHTML = "";
      const sources = Object.keys(counts);
      addAllButton(navSource, "source", sources);
      Object.entries(counts).forEach(function(entry) {
        addButton(navSource, entry[0], entry[1], "source", entry[0]);
      });

      navTheme.innerHTML = "";
      const themes = Array.from(new Set(aiSummary.map(function(a) { return a.theme; })));
      const themeCounts = {};
      themes.forEach(function(theme) {
        themeCounts[theme] = aiSummary.filter(function(a) { return a.theme === theme; }).length;
      });
      
      addAllButton(navTheme, "theme", themes);
      themes.forEach(function(theme) {
        addButton(navTheme, theme, themeCounts[theme], "theme", theme);
      });

      navSentiment.innerHTML = "";
      const sentiments = Array.from(new Set(aiSummary.map(function(a) { return a.sentiment; })));
      const sentimentCounts = {};
      sentiments.forEach(function(sentiment) {
        sentimentCounts[sentiment] = aiSummary.filter(function(a) { return a.sentiment === sentiment; }).length;
      });
      
      addAllButton(navSentiment, "sentiment", sentiments);
      sentiments.forEach(function(sentiment) {
        addButton(navSentiment, sentiment, sentimentCounts[sentiment], "sentiment", sentiment);
      });

      navUrgency.innerHTML = "";
      const urgencies = Array.from(new Set(aiSummary.map(function(a) { return a.urgency; })));
      const urgencyCounts = {};
      urgencies.forEach(function(urgency) {
        urgencyCounts[urgency] = aiSummary.filter(function(a) { return a.urgency === urgency; }).length;
      });
      
      addAllButton(navUrgency, "urgency", urgencies);
      urgencies.forEach(function(urgency) {
        addButton(navUrgency, urgency, urgencyCounts[urgency], "urgency", urgency);
      });
      
      updateActiveButtons();
    }

    const sources = Object.keys(counts);
    addAllButton(navSource, "source", sources);
    Object.entries(counts).forEach(function(entry) {
      addButton(navSource, entry[0], entry[1], "source", entry[0]);
    });
    
    render();

    fetch('/api/analyze')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        aiSummary = data.analysis;
        aiLoading.classList.add('hidden');
        initializeFilters();
        render();
      })
      .catch(function(err) {
        console.error('AI analysis failed:', err);
        aiLoading.classList.add('hidden');
      });
  </script>
</body>
</html>
`;

  return new Response(html, { 
    headers: { 
      "Content-Type": "text/html; charset=utf-8" 
    } 
  });
}

async function handleAnalyze(env: Env): Promise<Response> {
  let feedback: any[] = [];
  try {
    const { results } = await env.D1_FEEDBACK
      .prepare("SELECT id, source, message, timestamp FROM feedback")
      .all();
    feedback = results ?? [];
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch feedback from D1", details: err }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let aiSummary: any[] = [];
  let aiRaw: string | null = null;

  try {
    const prompt = `You are a JSON-only assistant. Analyze this feedback and return ONLY a valid JSON array with no other text.

Each object must have: id, theme, sentiment (Positive/Neutral/Negative), urgency (High/Medium/Low)

Feedback data:
${JSON.stringify(feedback.slice(0, 20), null, 2)}

Return ONLY the JSON array, nothing else.`;

    const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", { 
      prompt,
      max_tokens: 2048
    });

    aiRaw = typeof aiResponse === 'string' 
      ? aiResponse 
      : (aiResponse.response || aiResponse.output_text || JSON.stringify(aiResponse));

    if (aiRaw) {
      const jsonMatch = aiRaw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiSummary = JSON.parse(jsonMatch[0]);
      } else {
        aiSummary = JSON.parse(aiRaw);
      }
    }
  } catch (err) {
    console.error("Workers AI failed:", err);
    aiSummary = feedback.map(item => ({
      id: item.id,
      theme: "AI Failed - Mock Theme",
      sentiment: "Neutral",
      urgency: "Medium"
    }));
    aiRaw = "AI processing failed: " + (err instanceof Error ? err.message : String(err));
  }

  return new Response(
    JSON.stringify({
      analysis: aiSummary,
      debug: aiRaw
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      } 
    }
  );
}