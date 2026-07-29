// lib/discover.js — Tier 3: AI-assisted discovery.
//
// Runs a handful of web searches through the Anthropic Messages API (using the
// server-side web_search tool) to surface fee-free opportunities that aren't on
// our fixed source list at all. This is deliberately run less often than Tier 1
// (see the workflow — weekly, not daily) since each query costs an API call and
// broad web search is inherently noisier than a known structured source.
//
// Everything this returns STILL goes through lib/validate.js in index.js before
// ever touching the database — the model is asked to only report fee-free calls,
// but we never trust that claim on its own.

const SYSTEM_PROMPT = `You find legitimate, currently-open opportunities for visual artists — residencies, grants, exhibitions, open calls — that charge NO fee of any kind to apply or be considered (no application fee, no entry fee, no jury/selection fee).

For each opportunity found, output an object with exactly these fields:
- title (string)
- type ("residency" | "grant" | "exhibition" | "open-call")
- deadline (YYYY-MM-DD, must be a specific real future date — omit the whole object if you can't find one)
- location (string)
- is_remote (boolean)
- requirements (1-2 sentence summary in your own words)
- link (the specific application page URL — never a homepage)
- tags (array of lowercase strings, e.g. "painting", "photography", "emerging")
- has_fee (boolean — must be false)

Rules:
- Do not invent or guess any detail. If you're not confident an opportunity is genuinely fee-free and currently open, leave it out entirely.
- Only include opportunities you found real evidence for via search.
- Return a JSON array only. No prose, no markdown code fences, no commentary.`;

async function discoverViaAI(fetch, { anthropicApiKey, queries, model }) {
  const results = [];

  for (const query of queries) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-5",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Search for: "${query}". Find current opportunities matching the schema and rules above.`,
            },
          ],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      if (!res.ok) {
        console.warn(`  [discover] "${query}" → HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const textBlocks = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const clean = textBlocks.replace(/```json|```/g, "").trim();
      if (!clean) continue;

      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        results.push(...parsed.map((o) => ({ ...o, source: "ai_discovery" })));
      }
    } catch (err) {
      console.warn(`  [discover] query failed: "${query}" —`, err.message);
    }
  }

  return results;
}

const DEFAULT_QUERIES = [
  "open call visual artists no application fee 2026",
  "artist residency no fee accepting applications 2026",
  "grant for painters sculptors no application fee 2026",
  "exhibition open call visual artists free submission",
];

module.exports = { discoverViaAI, DEFAULT_QUERIES };
