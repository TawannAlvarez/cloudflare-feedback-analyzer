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
 * Main Route (/):
 * - Fetches feedback from D1 database
 * - Aggregates counts by source
 * - Returns HTML dashboard with filters and cards
 * - Displays feedback immediately (before AI analysis)
 * 
 * API Route (/api/analyze):
 * - Fetches feedback from D1
 * - Runs AI analysis on feedback (Workers AI - Llama 3)
 * - Extracts theme, sentiment, urgency for each item
 * - Returns JSON response with analysis results
 * 
 * Flow:
 * 1. User visits dashboard → sees feedback instantly
 * 2. Browser calls /api/analyze in background
 * 3. AI results populate asynchronously
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
    
    header { background: linear-gradient(135deg, #f6821f 0%, #f38020 100%); border-bottom: 3px solid #e67019; margin-bottom: 32px; padding: 24px 0; box-shadow: 0 2px 8px rgba(246, 130, 31, 0.15); }
    .header-content { display: flex; align-items: center; gap: 16px; }
    .logo-container { background: white; border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .logo { width: 100%; height: auto; }
    h1 { font-size: 28px; font-weight: 700; color: white; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: rgba(255, 255, 255, 0.9); }
    
    .main-content { padding-top: 32px; }
    .section { background: white; border-radius: 16px; padding: 28px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #1f2937; padding-bottom: 12px; border-bottom: 2px solid #f6821f; }
    
    .filters-grid { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; align-items: flex-start; }
    .filter-group { flex: 1; min-width: 200px; }
    .filter-label { font-size: 13px; font-weight: 600; color: #f6821f; margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
    .filter-dropdown { position: relative; }
    .filter-toggle { width: 100%; background: white; color: #374151; border: 2px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; text-align: left; }
    .filter-toggle:hover { border-color: #f6821f; }
    .filter-toggle.active { border-color: #f6821f; background: #fff7f0; }
    .filter-menu { display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white; border: 2px solid #f6821f; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-height: 300px; overflow-y: auto; z-index: 1000; min-width: 200px; }
    .filter-menu.open { display: block; }
    .filter-menu-item { padding: 10px 14px; cursor: pointer; transition: all 0.15s; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; user-select: none; }
    .filter-menu-item:last-child { border-bottom: none; }
    .filter-menu-item:hover { background: #fff7f0; color: #f6821f; }
    .filter-menu-item.selected { background: linear-gradient(135deg, #f6821f 0%, #f38020 100%); color: white; font-weight: 500; }
    .filter-arrow { transition: transform 0.2s; font-size: 12px; }
    .filter-arrow.open { transform: rotate(180deg); }
    
    .controls { display: flex; gap: 12px; align-items: center; padding-top: 20px; border-top: 1px solid #f3f4f6; margin-top: 20px; }
    .btn-clear { background: #374151; color: white; border: none; border-radius: 999px; padding: 10px 20px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s; }
    .btn-clear:hover { background: #1f2937; }
    
    .loading-indicator { display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, #fff7f0 0%, #ffe8d6 100%); padding: 16px 20px; border-radius: 12px; border-left: 4px solid #f6821f; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(246, 130, 31, 0.1); }
    .spinner { width: 20px; height: 20px; border: 3px solid #fcd9b6; border-top: 3px solid #f6821f; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .loading-text { font-weight: 500; color: #92400e; }
    
    .feedback-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .feedback-count { font-size: 14px; color: #6b7280; font-weight: 500; background: #f9fafb; padding: 6px 14px; border-radius: 999px; }
    
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 12px; transition: all 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(246, 130, 31, 0.15); border-color: #f6821f; }
    .meta { font-size: 13px; color: #6b7280; margin-bottom: 12px; display: flex; gap: 12px; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .tags { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .tag { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
    .tag-theme { background: linear-gradient(135deg, #fff7f0 0%, #ffe8d6 100%); color: #c2410c; border: 1px solid #fed7aa; }
    .tag-sentiment-Positive { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .tag-sentiment-Neutral { background: #f9fafb; color: #4b5563; border: 1px solid #e5e7eb; }
    .tag-sentiment-Negative { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .tag-urgency-High { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .tag-urgency-Medium { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; }
    .tag-urgency-Low { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .message { color: #1f2937; line-height: 1.6; }
    
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
      <div class="header-content">
        <div class="logo-container">
          <img src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" alt="Cloudflare" class="logo" />
        </div>
        <div>
          <h1>Feedback Dashboard</h1>
          <div class="subtitle">Tawann Alvarez</div>
        </div>
      </div>
    </div>
  </header>

  <div class="container main-content">
    <div id="ai-loading" class="loading-indicator">
      <div class="spinner"></div>
      <div class="loading-text">Analyzing feedback with AI...</div>
    </div>

    <div class="section">
      <h2 class="section-title">Filters</h2>
      
      <div class="filters-grid">
        <div class="filter-group">
          <label class="filter-label">Source</label>
          <div class="filter-dropdown">
            <button class="filter-toggle" id="source-toggle">
              <span id="source-label">All Sources</span>
              <span class="filter-arrow">▼</span>
            </button>
            <div class="filter-menu" id="source-menu"></div>
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Theme</label>
          <div class="filter-dropdown">
            <button class="filter-toggle" id="theme-toggle">
              <span id="theme-label">Loading...</span>
              <span class="filter-arrow">▼</span>
            </button>
            <div class="filter-menu" id="theme-menu"></div>
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Sentiment</label>
          <div class="filter-dropdown">
            <button class="filter-toggle" id="sentiment-toggle">
              <span id="sentiment-label">Loading...</span>
              <span class="filter-arrow">▼</span>
            </button>
            <div class="filter-menu" id="sentiment-menu"></div>
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Urgency</label>
          <div class="filter-dropdown">
            <button class="filter-toggle" id="urgency-toggle">
              <span id="urgency-label">Loading...</span>
              <span class="filter-arrow">▼</span>
            </button>
            <div class="filter-menu" id="urgency-menu"></div>
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
    const aiLoading = document.getElementById("ai-loading");
    const clearFiltersBtn = document.getElementById("clear-filters");

    // Dropdown elements
    const sourceToggle = document.getElementById("source-toggle");
    const sourceLabel = document.getElementById("source-label");
    const sourceMenu = document.getElementById("source-menu");
    const themeToggle = document.getElementById("theme-toggle");
    const themeLabel = document.getElementById("theme-label");
    const themeMenu = document.getElementById("theme-menu");
    const sentimentToggle = document.getElementById("sentiment-toggle");
    const sentimentLabel = document.getElementById("sentiment-label");
    const sentimentMenu = document.getElementById("sentiment-menu");
    const urgencyToggle = document.getElementById("urgency-toggle");
    const urgencyLabel = document.getElementById("urgency-label");
    const urgencyMenu = document.getElementById("urgency-menu");

    // Toggle dropdown menus
    sourceToggle.onclick = function(e) { 
      e.stopPropagation();
      toggleMenu('source'); 
    };
    themeToggle.onclick = function(e) { 
      e.stopPropagation();
      toggleMenu('theme'); 
    };
    sentimentToggle.onclick = function(e) { 
      e.stopPropagation();
      toggleMenu('sentiment'); 
    };
    urgencyToggle.onclick = function(e) { 
      e.stopPropagation();
      toggleMenu('urgency'); 
    };

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.filter-dropdown')) {
        sourceMenu.classList.remove('open');
        themeMenu.classList.remove('open');
        sentimentMenu.classList.remove('open');
        urgencyMenu.classList.remove('open');
        document.querySelectorAll('.filter-arrow').forEach(function(arrow) {
          arrow.classList.remove('open');
        });
      }
    });

    function toggleMenu(type) {
      const menus = { source: sourceMenu, theme: themeMenu, sentiment: sentimentMenu, urgency: urgencyMenu };
      const toggles = { source: sourceToggle, theme: themeToggle, sentiment: sentimentToggle, urgency: urgencyToggle };
      const currentMenu = menus[type];
      const currentToggle = toggles[type];
      const currentArrow = currentToggle.querySelector('.filter-arrow');
      
      // Close all other menus
      Object.keys(menus).forEach(function(key) {
        if (key !== type) {
          menus[key].classList.remove('open');
          toggles[key].querySelector('.filter-arrow').classList.remove('open');
        }
      });
      
      // Toggle current menu
      const isOpen = currentMenu.classList.contains('open');
      
      if (isOpen) {
        currentMenu.classList.remove('open');
        currentArrow.classList.remove('open');
      } else {
        currentMenu.classList.add('open');
        currentArrow.classList.add('open');
      }
    }

    clearFiltersBtn.onclick = function() {
      activeFilters.source = [];
      activeFilters.theme = [];
      activeFilters.sentiment = [];
      activeFilters.urgency = [];
      updateDropdownLabels();
      updateMenuItems();
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

    function addMenuItem(menu, label, count, filterType, filterValue) {
      const item = document.createElement("div");
      item.className = "filter-menu-item";
      item.textContent = count !== undefined ? label + ' (' + count + ')' : label;
      item.dataset.filterType = filterType;
      item.dataset.filterValue = filterValue;
      
      item.onclick = function(e) {
        e.stopPropagation();
        const index = activeFilters[filterType].indexOf(filterValue);
        
        if (index === -1) {
          activeFilters[filterType].push(filterValue);
        } else {
          activeFilters[filterType].splice(index, 1);
        }
        
        updateDropdownLabels();
        updateMenuItems();
        render();
      };
      
      menu.appendChild(item);
      return item;
    }

    function updateDropdownLabels() {
      // Source
      if (activeFilters.source.length === 0) {
        sourceLabel.textContent = "All Sources";
        sourceToggle.classList.remove('active');
      } else if (activeFilters.source.length === Object.keys(counts).length) {
        sourceLabel.textContent = "All Sources";
        sourceToggle.classList.add('active');
      } else {
        sourceLabel.textContent = activeFilters.source.length + ' selected';
        sourceToggle.classList.add('active');
      }

      // Theme
      if (aiSummary.length > 0) {
        const allThemes = Array.from(new Set(aiSummary.map(function(a) { return a.theme; })));
        if (activeFilters.theme.length === 0) {
          themeLabel.textContent = "All Themes";
          themeToggle.classList.remove('active');
        } else if (activeFilters.theme.length === allThemes.length) {
          themeLabel.textContent = "All Themes";
          themeToggle.classList.add('active');
        } else {
          themeLabel.textContent = activeFilters.theme.length + ' selected';
          themeToggle.classList.add('active');
        }
      }

      // Sentiment
      if (aiSummary.length > 0) {
        const allSentiments = Array.from(new Set(aiSummary.map(function(a) { return a.sentiment; })));
        if (activeFilters.sentiment.length === 0) {
          sentimentLabel.textContent = "All Sentiments";
          sentimentToggle.classList.remove('active');
        } else if (activeFilters.sentiment.length === allSentiments.length) {
          sentimentLabel.textContent = "All Sentiments";
          sentimentToggle.classList.add('active');
        } else {
          sentimentLabel.textContent = activeFilters.sentiment.length + ' selected';
          sentimentToggle.classList.add('active');
        }
      }

      // Urgency
      if (aiSummary.length > 0) {
        const allUrgencies = Array.from(new Set(aiSummary.map(function(a) { return a.urgency; })));
        if (activeFilters.urgency.length === 0) {
          urgencyLabel.textContent = "All Urgencies";
          urgencyToggle.classList.remove('active');
        } else if (activeFilters.urgency.length === allUrgencies.length) {
          urgencyLabel.textContent = "All Urgencies";
          urgencyToggle.classList.add('active');
        } else {
          urgencyLabel.textContent = activeFilters.urgency.length + ' selected';
          urgencyToggle.classList.add('active');
        }
      }
    }

    function updateMenuItems() {
      [sourceMenu, themeMenu, sentimentMenu, urgencyMenu].forEach(function(menu) {
        Array.from(menu.children).forEach(function(item) {
          const filterType = item.dataset.filterType;
          const filterValue = item.dataset.filterValue;
          
          if (activeFilters[filterType] && activeFilters[filterType].includes(filterValue)) {
            item.classList.add('selected');
          } else {
            item.classList.remove('selected');
          }
        });
      });
    }

    function initializeFilters() {
      sourceMenu.innerHTML = "";
      Object.entries(counts).forEach(function(entry) {
        addMenuItem(sourceMenu, entry[0], entry[1], "source", entry[0]);
      });

      themeMenu.innerHTML = "";
      const themes = Array.from(new Set(aiSummary.map(function(a) { return a.theme; })));
      const themeCounts = {};
      themes.forEach(function(theme) {
        themeCounts[theme] = aiSummary.filter(function(a) { return a.theme === theme; }).length;
      });
      themes.forEach(function(theme) {
        addMenuItem(themeMenu, theme, themeCounts[theme], "theme", theme);
      });

      sentimentMenu.innerHTML = "";
      const sentiments = Array.from(new Set(aiSummary.map(function(a) { return a.sentiment; })));
      const sentimentCounts = {};
      sentiments.forEach(function(sentiment) {
        sentimentCounts[sentiment] = aiSummary.filter(function(a) { return a.sentiment === sentiment; }).length;
      });
      sentiments.forEach(function(sentiment) {
        addMenuItem(sentimentMenu, sentiment, sentimentCounts[sentiment], "sentiment", sentiment);
      });

      urgencyMenu.innerHTML = "";
      const urgencies = Array.from(new Set(aiSummary.map(function(a) { return a.urgency; })));
      const urgencyCounts = {};
      urgencies.forEach(function(urgency) {
        urgencyCounts[urgency] = aiSummary.filter(function(a) { return a.urgency === urgency; }).length;
      });
      urgencies.forEach(function(urgency) {
        addMenuItem(urgencyMenu, urgency, urgencyCounts[urgency], "urgency", urgency);
      });
      
      updateDropdownLabels();
      updateMenuItems();
    }

    // Initialize source dropdown immediately
    Object.entries(counts).forEach(function(entry) {
      addMenuItem(sourceMenu, entry[0], entry[1], "source", entry[0]);
    });
    updateDropdownLabels();
    
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