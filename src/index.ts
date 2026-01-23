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
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont; background: #f6f7f9; margin: 0; padding: 32px; color: #111; }
    h1 { margin-bottom: 12px; }
    h2 { margin-top: 30px; margin-bottom: 12px; font-size: 20px; }
    .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 30px; }
    .nav button { background: white; color: #333; border: 2px solid #ddd; border-radius: 999px; padding: 8px 16px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
    .nav button:hover { border-color: #f6821f; }
    .nav button.active { background: #f6821f; color: white; border-color: #f6821f; }
    .card { background: white; border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
    .meta { font-size: 12px; opacity: 0.6; margin-bottom: 6px; }
    pre { background: #eee; padding: 12px; border-radius: 10px; overflow-x: auto; margin-top: 20px; font-size: 12px; }
    
    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #fff;
      padding: 16px;
      border-radius: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      margin-bottom: 20px;
    }
    .spinner {
      width: 20px;
      height: 20px;
      border: 3px solid #ddd;
      border-top: 3px solid #f6821f;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <h1>Feedback Dashboard - Tawann Alvarez</h1>

  <div id="ai-loading" class="loading-indicator">
    <div class="spinner"></div>
    <div>Analyzing feedback with AI...</div>
  </div>

  <h2>Filter by Source</h2>
  <div class="nav" id="nav-source"></div>

  <h2>Filter by Theme</h2>
  <div class="nav" id="nav-theme">
    <button class="inactive">Loading themes...</button>
  </div>

  <h2>Filter by Sentiment</h2>
  <div class="nav" id="nav-sentiment">
    <button class="inactive">Loading...</button>
  </div>

  <h2>Filter by Urgency</h2>
  <div class="nav" id="nav-urgency">
    <button class="inactive">Loading...</button>
  </div>

  <div style="margin-bottom: 20px;">
    <button id="clear-filters" style="background: #666; color: white; border: none; border-radius: 999px; padding: 8px 16px; cursor: pointer; font-weight: 500;">Clear All Filters</button>
  </div>

  <div id="content"></div>

  <h2>AI Debug Output</h2>
  <pre id="ai-debug">Waiting for AI analysis...</pre>

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
    const aiDebug = document.getElementById("ai-debug");
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

      filtered.forEach(function(item) {
        const summary = aiSummary.find(function(a) { return a.id === item.id; }) || { theme: "Unknown", sentiment: "Neutral", urgency: "Medium" };
        const card = document.createElement("div");
        card.className = "card";
        
        const summaryHTML = isLoading 
          ? '<div style="opacity: 0.5;"><strong>Theme:</strong> Loading... - <strong>Sentiment:</strong> Loading... - <strong>Urgency:</strong> Loading...</div>'
          : '<div><strong>Theme:</strong> ' + summary.theme + ' - <strong>Sentiment:</strong> ' + summary.sentiment + ' - <strong>Urgency:</strong> ' + summary.urgency + '</div>';
        
        card.innerHTML = '<div class="meta">' + item.source + ' - ' + new Date(item.timestamp).toLocaleString() + '</div>' + summaryHTML + '<div>' + item.message + '</div>';
        content.appendChild(card);
      });
      
      if (filtered.length === 0) {
        const hasActiveFilters = activeFilters.source.length > 0 || 
                                 activeFilters.theme.length > 0 || 
                                 activeFilters.sentiment.length > 0 || 
                                 activeFilters.urgency.length > 0;
        
        if (hasActiveFilters) {
          content.innerHTML = '<div class="card">No feedback matches the current filters.</div>';
        } else {
          content.innerHTML = '<div class="card">No feedback available.</div>';
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
        aiDebug.textContent = data.debug || "AI analysis complete";
        aiLoading.classList.add('hidden');
        initializeFilters();
        render();
      })
      .catch(function(err) {
        console.error('AI analysis failed:', err);
        aiDebug.textContent = "AI analysis failed: " + err.message;
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