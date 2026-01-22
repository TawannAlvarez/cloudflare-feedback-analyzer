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

interface Env {
  D1_FEEDBACK: D1Database;
}

export default {
  async fetch(_: Request, env: Env): Promise<Response> {
  // 1️⃣ Fetch feedback
  const { results = [] } = await env.D1_FEEDBACK
    .prepare("SELECT id, source, message, timestamp FROM feedback")
    .all();

  // 2️⃣ Count by source
  const countsBySource: Record<string, number> = {};
  for (const item of results) {
    countsBySource[item.source] =
      (countsBySource[item.source] || 0) + 1;
  }

  // 3️⃣ HTML dashboard
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Cloudflare Feedback Dashboard</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont;
      background: #f6f7f9;
      margin: 0;
      padding: 32px;
      color: #111;
    }

    h1 {
      margin-bottom: 12px;
    }

    h2 {
      margin-top: 30px;
      margin-bottom: 12px;
      font-size: 20px;
    }

    .themes {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 30px;
    }

    .theme-card {
      background: #fff;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      flex: 1 0 120px;
      text-align: center;
      font-weight: 500;
      color: #111;
    }

    .nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 30px;
    }

    .nav button {
      background: #f6821f;
      color: white;
      border: none;
      border-radius: 999px;
      padding: 8px 16px;
      cursor: pointer;
      font-weight: 500;
    }

    .nav button.inactive {
      background: #ddd;
      color: #333;
    }

    .card {
      background: white;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }

    .meta {
      font-size: 12px;
      opacity: 0.6;
      margin-bottom: 6px;
    }
  </style>
</head>

<body>
  <h1>Feedback Dashboard</h1>

  <h2>Top Themes</h2>
  <div class="themes">
    <div class="theme-card">Performance</div>
    <div class="theme-card">UI / UX</div>
    <div class="theme-card">Billing</div>
    <div class="theme-card">Documentation</div>
    <div class="theme-card">Support</div>
  </div>

  <div class="nav" id="nav"></div>
  <div id="content"></div>

  <script>
    const feedback = ${JSON.stringify(results)};
    const counts = ${JSON.stringify(countsBySource)};
    const content = document.getElementById("content");
    const nav = document.getElementById("nav");

    function render(source) {
      content.innerHTML = "";
      const filtered = source === "ALL"
        ? feedback
        : feedback.filter(f => f.source === source);

      filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = \`
          <div class="meta">\${item.source} • \${new Date(item.timestamp).toLocaleString()}</div>
          <div>\${item.message}</div>
        \`;
        content.appendChild(card);
      });
    }

    function addButton(label, count, source) {
      const btn = document.createElement("button");
      btn.textContent = \`\${label} (\${count})\`;
      btn.onclick = () => render(source);
      nav.appendChild(btn);
    }

    // All button
    addButton("All", feedback.length, "ALL");

    // Source buttons
    Object.entries(counts).forEach(([source, count]) => {
      addButton(source, count, source);
    });

    // Initial render
    render("ALL");
  </script>
</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}
} satisfies ExportedHandler<Env>;
