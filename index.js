// index.js — SUBM1T. scraper entry point.
//
// This is now the ONE script the workflow runs (previously the workflow ran
// scraper.js, a hardcoded static list, while this file — with the real scraping
// logic — was never actually invoked). Pipeline:
//   Tier 1: structured listing sources + re-checked single program pages
//   Tier 3: AI web-search discovery (only if ANTHROPIC_API_KEY is set)
//   -> shared isValid() gate (fee-free, deep link, future deadline) on EVERYTHING
//   -> dedup by title
//   -> junk cleanup + expired prune
//   -> batched upsert

const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const { isValid, normalizeTitle } = require("./lib/validate");
const {
  scrapeSubmittable,
  scrapeGrantsArt,
  scrapeNYFASource,
  scrapeResArtis,
  scrapeAAC,
  scrapeCaFE,
  scrapeEFlux,
  scrapeArtconnect,
  scrapeTransArtists,
  scrapeSinglePage,
  SINGLE_PROGRAM_PAGES,
} = require("./lib/sources");
const { discoverViaAI, pickWeeklyQueries } = require("./lib/discover");

const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

async function run() {
  console.log(`[SUBM1T] Starting scrape — ${new Date().toISOString()}`);

  const allResults = [];

  // --- Tier 1a: structured/listing sources ---
  console.log("[SUBM1T] Tier 1: scraping structured sources...");
  const structured = await Promise.allSettled([
    scrapeSubmittable(fetch),
    scrapeGrantsArt(fetch),
    scrapeNYFASource(fetch),
    scrapeResArtis(fetch),
    scrapeAAC(fetch),
    scrapeCaFE(fetch),
    scrapeEFlux(fetch),
    scrapeArtconnect(fetch),
    scrapeTransArtists(fetch),
  ]);

  structured.forEach((result, i) => {
    if (result.status === "fulfilled") {
      console.log(`  [source ${i + 1}] ${result.value.length} opportunities`);
      allResults.push(...result.value);
    } else {
      console.warn(`  [source ${i + 1}] failed:`, result.reason?.message);
    }
  });

  // --- Tier 1b: re-check known single program pages (live deadline/fee scan) ---
  console.log(`[SUBM1T] Tier 1: re-checking ${SINGLE_PROGRAM_PAGES.length} program pages...`);
  for (const config of SINGLE_PROGRAM_PAGES) {
    const results = await scrapeSinglePage(fetch, config);
    if (results.length > 0) {
      console.log(`  [${config.source}] still open, deadline ${results[0].deadline}`);
      allResults.push(...results);
    }
    await new Promise((r) => setTimeout(r, 400)); // polite delay
  }

  // --- Tier 3: AI-assisted web search discovery ---
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("[SUBM1T] Tier 3: AI-assisted discovery...");
    try {
      // 8 queries/week, rotating through the ~36-query pool over about 4-5 weeks.
      // Bump the first argument if you want broader coverage per run (costs more API calls).
      const queries = pickWeeklyQueries(8);
      console.log(`  [discover] this week's queries: ${queries.join(" | ")}`);
      const discovered = await discoverViaAI(fetch, {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        queries,
      });
      console.log(`  [discover] ${discovered.length} candidates returned`);
      allResults.push(...discovered);
    } catch (err) {
      console.warn("[SUBM1T] Tier 3 failed:", err.message);
    }
  } else {
    console.log("[SUBM1T] Skipping Tier 3 — no ANTHROPIC_API_KEY secret set.");
  }

  // --- Shared validation gate — applies to every result regardless of source ---
  console.log(`[SUBM1T] ${allResults.length} raw results before validation`);
  const valid = allResults.filter(isValid);
  console.log(`[SUBM1T] ${valid.length} pass validation (fee-free, deep link, future deadline)`);

  // --- Dedup across all sources by title ---
  const seen = new Set();
  const clean = valid.filter((o) => {
    const key = o.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`[SUBM1T] ${clean.length} unique opportunities after dedup`);

  if (clean.length === 0) {
    console.log("[SUBM1T] Nothing to write. Done.");
    return;
  }

  // --- Cross-run duplicate check ---
  // The within-run dedup above only catches duplicates found in the SAME run. Without this
  // step, the same opportunity found today by one source and again next week by a different
  // source (e.g. a program-page re-check vs. an AI-discovery hit) would insert as a second row,
  // since the upsert's conflict target can't help until we know what's already in the table.
  const { data: existingRows, error: existingErr } = await supabase
    .from("opportunities")
    .select("title")
    .limit(2000);

  if (existingErr) {
    console.warn("[SUBM1T] Could not fetch existing titles, skipping cross-run dedup:", existingErr.message);
  }

  const existingNormalized = new Set((existingRows || []).map((r) => normalizeTitle(r.title)));
  const toWrite = clean.filter((o) => !existingNormalized.has(normalizeTitle(o.title)));
  console.log(`[SUBM1T] ${toWrite.length} genuinely new after cross-run dedup (${clean.length - toWrite.length} already in DB)`);

  if (toWrite.length === 0) {
    console.log("[SUBM1T] Nothing new to write. Done.");
    return;
  }

  // --- Wipe old junk rows that slipped in from previous runs ---
  const { error: delError } = await supabase
    .from("opportunities")
    .delete()
    .or(
      [
        "title.ilike.%instagram%",
        "title.ilike.%facebook%",
        "title.ilike.%subscribe%",
        "title.ilike.%newsletter%",
        "title.ilike.%follow us%",
        "title.ilike.%privacy policy%",
        "title.ilike.%cookie policy%",
        "title.ilike.%contact us%",
        "title.ilike.%birth certificate%",
        "title.ilike.%our campus%",
        "title.ilike.%back to top%",
        "title.ilike.%sportico%",
        "title.ilike.%robbreport%",
        "title.ilike.%indiewire%",
      ].join(",")
    );
  if (delError) console.warn("[SUBM1T] Cleanup delete error:", delError.message);

  // --- Prune expired deadlines (moved here from scraper.js v2 so it always runs) ---
  const today = new Date().toISOString().slice(0, 10);
  const { data: prunedRows, error: pruneError } = await supabase
    .from("opportunities")
    .delete()
    .lt("deadline", today)
    .not("deadline", "is", null)
    .select("id");
  if (pruneError) console.warn("[SUBM1T] Prune error:", pruneError.message);
  else console.log(`[SUBM1T] Pruned ${(prunedRows || []).length} expired rows`);

  // --- Upsert in batches of 50 ---
  // NOTE: conflict target is `title` ALONE now (not title+source) — the same opportunity
  // found by two different sources should collide and skip, not create a second row.
  // Requires a unique constraint on `title` in the `opportunities` table:
  //   ALTER TABLE opportunities ADD CONSTRAINT opportunities_title_key UNIQUE (title);
  // (see the SQL cleanup steps for removing any pre-existing duplicate titles first)
  let inserted = 0;
  for (let i = 0; i < toWrite.length; i += 50) {
    const batch = toWrite.slice(i, i + 50);
    const { error } = await supabase
      .from("opportunities")
      .upsert(batch, { onConflict: "title", ignoreDuplicates: true });
    if (error) {
      console.warn(`[SUBM1T] Upsert error (batch ${Math.floor(i / 50) + 1}):`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[SUBM1T] Done. ${inserted} rows written.`);
}

run().catch((err) => {
  console.error("[SUBM1T] Fatal error:", err);
  process.exit(1);
});
