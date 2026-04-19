// index.js — the actual cron entry point

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const {
  scrapeGeneric, scrapeEFlux, scrapeCallForEntry, scrapeNYFA, GENERIC_SITES
} = require('./scraper');

const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

async function run() {
  console.log(`[SUBM1T] Starting scrape — ${new Date().toISOString()}`);
  
  const allResults = [];

  // Custom scrapers
  try { allResults.push(...await scrapeEFlux(fetch)); } catch(e) { console.warn('e-flux failed'); }
  try { allResults.push(...await scrapeCallForEntry(fetch)); } catch(e) { console.warn('cafe failed'); }
  try { allResults.push(...await scrapeNYFA(fetch)); } catch(e) { console.warn('nyfa failed'); }

  // Generic scraper for the rest
  for (const site of GENERIC_SITES) {
    const results = await scrapeGeneric(fetch, site);
    allResults.push(...results);
    await new Promise(r => setTimeout(r, 500)); // polite delay
  }

  // Filter out anything with no title or confirmed fee
  const clean = allResults.filter(o => o.title && o.title.length > 5 && !o.has_fee);

  console.log(`[SUBM1T] ${clean.length} opportunities found`);

  // Upsert in batches
  for (let i = 0; i < clean.length; i += 50) {
    const batch = clean.slice(i, i + 50);
    const { error } = await supabase
      .from('opportunities')
      .upsert(batch, { onConflict: 'title,source', ignoreDuplicates: true });
    if (error) console.error('Upsert error:', error.message);
  }

  console.log(`[SUBM1T] Done.`);
}

run();
