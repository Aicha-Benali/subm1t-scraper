// index.js — SUBM1T. scraper entry point

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
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
} = require('./scraper');

const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

async function run() {
  console.log(`[SUBM1T] Starting scrape — ${new Date().toISOString()}`);

  const allResults = [];

  // Structured/API sources first
  console.log('[SUBM1T] Scraping structured sources...');
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
    if (result.status === 'fulfilled') {
      console.log(`  [source ${i+1}] ${result.value.length} opportunities`);
      allResults.push(...result.value);
    } else {
      console.warn(`  [source ${i+1}] failed:`, result.reason?.message);
    }
  });

  // Individual program pages — polite delay between each
  console.log(`[SUBM1T] Scraping ${SINGLE_PROGRAM_PAGES.length} program pages...`);
  for (const config of SINGLE_PROGRAM_PAGES) {
    const results = await scrapeSinglePage(fetch, config);
    if (results.length > 0) {
      console.log(`  [${config.source}] ${results.length} found`);
      allResults.push(...results);
    }
    await new Promise(r => setTimeout(r, 400)); // polite delay
  }

  // Final dedup across all sources by title
  const seen = new Set();
  const clean = allResults.filter(o => {
    if (!o || !o.title) return false;
    const key = o.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[SUBM1T] ${clean.length} unique opportunities after dedup`);

  if (clean.length === 0) {
    console.log('[SUBM1T] Nothing to write. Done.');
    return;
  }

  // Wipe old junk rows that slipped in from previous runs
  const { error: delError } = await supabase
    .from('opportunities')
    .delete()
    .or([
      'title.ilike.%instagram%',
      'title.ilike.%facebook%',
      'title.ilike.%subscribe%',
      'title.ilike.%newsletter%',
      'title.ilike.%follow us%',
      'title.ilike.%privacy policy%',
      'title.ilike.%cookie policy%',
      'title.ilike.%contact us%',
      'title.ilike.%birth certificate%',
      'title.ilike.%our campus%',
      'title.ilike.%back to top%',
      'title.ilike.%sportico%',
      'title.ilike.%robbreport%',
      'title.ilike.%indiewire%',
    ].join(','));

  if (delError) console.warn('[SUBM1T] Cleanup delete error:', delError.message);

  // Upsert in batches of 50
  let inserted = 0;
  for (let i = 0; i < clean.length; i += 50) {
    const batch = clean.slice(i, i + 50);
    const { error } = await supabase
      .from('opportunities')
      .upsert(batch, { onConflict: 'title,source', ignoreDuplicates: true });
    if (error) {
      console.warn(`[SUBM1T] Upsert error (batch ${Math.floor(i/50)+1}):`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[SUBM1T] Done. ${inserted} rows written.`);
}

run().catch(err => {
  console.error('[SUBM1T] Fatal error:', err);
  process.exit(1);
});
