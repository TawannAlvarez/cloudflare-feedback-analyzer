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
import mockFeedback from "./mockFeedback.json";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // --- Step 1: Aggregate counts by source ---
    const countsBySource = mockFeedback.reduce((acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let aiSummary;

    try {
      // --- Step 2: Call Workers AI ---
      const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: `Analyze this feedback and return JSON:
For each item, include:
  - theme
  - sentiment (Positive, Neutral, Negative)
  - urgency (High, Medium, Low)
Feedback: ${JSON.stringify(mockFeedback)}`
      });

      // Parse AI JSON output
      aiSummary = JSON.parse(aiResponse.output_text);
    } catch (err) {
      // --- Step 3: Fallback if AI is unavailable ---
      aiSummary = mockFeedback.map(item => ({
        id: item.id,
        theme: "Mock Theme",
        sentiment: "Neutral",
        urgency: "Medium"
      }));
    }

    // --- Step 4: Return aggregated response ---
    return new Response(
      JSON.stringify({
        summary: {
          totalFeedback: mockFeedback.length,
          countsBySource
        },
        feedback: mockFeedback,
        aiSummary
      }, null, 2),
      { headers: { "Content-Type": "application/json" } }
    );
  }
} satisfies ExportedHandler<Env>;
