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

// A much larger pool than before, organized so it's easy to keep adding to. Since Tier 3
// now runs weekly (not daily) to control API cost, pickWeeklyQueries() below rotates through
// this whole pool over several weeks instead of running all ~40 every time — you get full
// coverage over roughly a month rather than either (a) only ever searching the same 4 terms,
// or (b) paying for 40 searches every single week.

const QUERY_POOL = [
  // By opportunity type
  "open call visual artists no application fee 2026",
  "artist residency no fee accepting applications 2026",
  "grant for painters sculptors no application fee 2026",
  "exhibition open call visual artists free submission",
  "juried art show no entry fee 2026",
  "artist fellowship no application fee 2026",
  "public art commission call for artists no fee",
  "artist in residence program fully funded no fee",

  // By medium/discipline
  "open call photographers no submission fee 2026",
  "open call sculptors no application fee 2026",
  "open call ceramicists no entry fee 2026",
  "open call printmakers no application fee",
  "open call textile fiber artists no fee",
  "open call digital new media artists no fee 2026",
  "open call installation artists no application fee",
  "open call mixed media artists free submission",
  "open call video artists no entry fee",
  "open call painters no application fee 2026",
  "open call drawing artists no fee",
  "open call collage artists no submission fee",

  // By eligibility / who it's for
  "open call emerging artists no fee 2026",
  "artist grant BIPOC no application fee",
  "artist residency women artists no fee",
  "open call LGBTQ+ artists no application fee",
  "artist grant disabled artists no fee",
  "residency for artists of color no application fee",
  "open call student artists no entry fee",
  "artist residency international no fee 2026",

  // Explicit fee-waiver / fee-free framing
  "artist opportunity application fee waived 2026",
  "call for entry fee-free artists 2026",
  "no cost art competition 2026",
  "free to enter art open call 2026",

  // Geography-flavored (adjust/add your own regions here)
  "open call artists United States no application fee 2026",
  "artist residency Europe no fee 2026",
  "public art call Texas no fee",
  "artist grant New York no application fee 2026",
];

// ISO week number, used to pick a stable-but-rotating slice of the pool each run.
function isoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Picks `count` queries from QUERY_POOL, rotating which slice is used based on the
// current ISO week so the whole pool gets covered over several weeks. Increase `count`
// if you want more coverage per run (at the cost of more API calls per run).
function pickWeeklyQueries(count = 8, pool = QUERY_POOL, date = new Date()) {
  const week = isoWeekNumber(date);
  const start = (week * count) % pool.length;
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(pool[(start + i) % pool.length]);
  }
  return picked;
}

module.exports = { discoverViaAI, QUERY_POOL, pickWeeklyQueries };
