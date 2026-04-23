// scraper.js — SUBM1T. smart scraper v2
// Strategy: only pull from sources with clean structured data
// No more generic scraping of random page elements

const cheerio = require('cheerio');

// ── Validation ────────────────────────────────────────────────────────────

const EXACT_JUNK = new Set([
  'instagram','facebook','twitter','linkedin','pinterest','youtube','tiktok','bluesky',
  'subscribe','newsletter','sign up','log in','login','register','contact us','about us',
  'home','search','menu','navigation','back to top','read more','learn more','click here',
  'privacy policy','terms of use','terms and conditions','cookie policy','accessibility',
  'about us','our team','our work','our mission','who we are','what we do',
  'programs','exhibitions','residencies','opportunities','resources','research','publications',
  'facilities','directions','contact','events','news','press','donate','support us',
  'membership','join','volunteers','staff','board','governance','partners','sponsors',
  'shop','store','calendar','upcoming','past','archive','follow us',
  'facebook logo','instagram logo','link to facebook','link to instagram',
]);

const JUNK_PATTERNS = [
  /^(follow us|subscribe|newsletter|sign up|log in|register|contact|about|home|search|menu)/i,
  /^(privacy|terms|cookie|accessibility|copyright|powered by)/i,
  /^(facebook|instagram|twitter|linkedin|youtube|tiktok|bluesky|pinterest)/i,
  /^(get a |buy |shop |donate|give now|click here|read more|learn more)/i,
  /^(our campus|our mission|our team|press release|page not found)/i,
  /^\d+$/,
  /^[^a-zA-Z]*$/,
  /robbreport|sportico|indiewire|wwd\s/i,
  /lamborghini|ferrari|nfl|nba|nhl|mlb|nascar/i,
  /\.st\d+\{/i,
  /clip-path|fill-rule|clip-rule/i,
  /^comment on /i,
  /^exhibition just opened /i,
  /^student show just opened /i,
  /\d{1,2} [a-z]{3} 202\d\s*[–-]\s*\d{1,2} [a-z]{3} 202\d/i,
];

// Title MUST contain at least one of these to pass
const MUST_CONTAIN_ONE = [
  'open call','call for','residency','fellowship','grant','award','prize',
  'commission','competition','scholarship','stipend','artist-in-residence',
  'air program','emerging artist','artist opportunity','apply','applications open',
  'accepting applications','now accepting','seeking artists','juried',
  'funded','paid opportunity','artist fund','artist grant',
];

function isTitleValid(title) {
  if (!title) return false;
  const t = title.trim();
  if (t.length < 10 || t.length > 250) return false;
  if (EXACT_JUNK.has(t.toLowerCase())) return false;
  if (JUNK_PATTERNS.some(p => p.test(t))) return false;
  return true;
}

function hasOpportunitySignal(title, bodyText) {
  const combined = (title + ' ' + (bodyText || '')).toLowerCase();
  return MUST_CONTAIN_ONE.some(kw => combined.includes(kw));
}

function detectFee(text) {
  const t = (text || '').toLowerCase();
  const FREE = ['no fee','free to apply','no application fee','free entry','no entry fee','no cost to apply','waived fee','no submission fee'];
  const FEE  = ['application fee','entry fee','submission fee','processing fee','registration fee','reading fee','jury fee'];
  if (FREE.some(p => t.includes(p))) return false;
  if (FEE.some(p => t.includes(p))) return true;
  if (/\$\s*\d+/.test(t) && t.includes('fee')) return true;
  return null;
}

function parseDeadline(text) {
  if (!text) return null;
  const patterns = [
    /deadline[:\s]+([A-Za-z]+ \d{1,2},?\s*202[5-9])/i,
    /due[:\s]+([A-Za-z]+ \d{1,2},?\s*202[5-9])/i,
    /closes?[:\s]+([A-Za-z]+ \d{1,2},?\s*202[5-9])/i,
    /(\d{4}-\d{2}-\d{2})/,
    /([A-Za-z]+ \d{1,2},?\s*202[5-9])/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const d = new Date(m[1] || m[0]);
      if (!isNaN(d) && d > new Date()) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function makeOpp({ title, type, location, deadline, link, source, bodyText, tags }) {
  title = (title || '').trim().replace(/\s+/g, ' ');
  if (!isTitleValid(title)) return null;
  if (!hasOpportunitySignal(title, bodyText)) return null;
  if (detectFee(bodyText) === true) return null;
  if (deadline && new Date(deadline) < new Date()) return null;
  return {
    title, type: type || 'open_call', location: location || null,
    deadline: deadline || null, link: link || null, has_fee: false,
    tags: tags || [], source: source || 'unknown',
  };
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter(o => {
    if (!o) return false;
    const key = o.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPERS — each targets only structured listing elements
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeSubmittable(fetch) {
  try {
    const res = await fetch(
      'https://api.submittable.com/v1/public-listings?category=visual-art&hasFee=false&size=100',
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const items = json.items || json.listings || json.data || [];
    return dedup(items.map(item => makeOpp({
      title:    item.title || item.name,
      type:     'open_call',
      location: item.country || item.location || null,
      deadline: item.closeDate || item.deadline || null,
      link:     item.url || item.submissionUrl || `https://submittable.com/submit/${item.id}`,
      source:   'Submittable',
      bodyText: (item.description || '') + ' call for submissions free to apply',
      tags:     ['visual_art'],
    })).filter(Boolean));
  } catch(e) { console.warn('[Submittable] failed:', e.message); return []; }
}

async function scrapeGrantsArt(fetch) {
  try {
    const res = await fetch('https://grants.art/api/grants?status=open&limit=200', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json.grants || json.data || []);
    return dedup(items.map(item => {
      if (item.fee && item.fee > 0) return null;
      return makeOpp({
        title:    item.name || item.title,
        type:     'grant',
        location: item.location || 'USA',
        deadline: item.deadline || item.due_date || null,
        link:     item.url || item.link || null,
        source:   'Grants.art',
        bodyText: (item.description || '') + ' grant award artist fellowship free to apply',
        tags:     ['grant'],
      });
    }).filter(Boolean));
  } catch(e) { console.warn('[Grants.art] failed:', e.message); return []; }
}

async function scrapeNYFASource(fetch) {
  try {
    const html = await (await fetch('https://source.nyfa.org/content/opportunity/?sort=date', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('.opportunity-listing, .listing-item, article.post, .entry, .views-row').each((_, el) => {
      const title    = $(el).find('h2, h3, .title, .entry-title').first().text().trim();
      const body     = $(el).text();
      const link     = $(el).find('a').first().attr('href');
      const opp = makeOpp({
        title, bodyText: body, source: 'NYFA Source', type: 'open_call', location: 'USA',
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://source.nyfa.org${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[NYFA Source] failed:', e.message); return []; }
}

async function scrapeResArtis(fetch) {
  try {
    const html = await (await fetch('https://www.resartis.org/residencies/?availability=open', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('.residency-item, .residence-card, article, .listing-card, .grid-item').each((_, el) => {
      const title    = $(el).find('h2, h3, h4, .title').first().text().trim();
      const body     = $(el).text();
      const link     = $(el).find('a').first().attr('href');
      const location = $(el).find('.location, .country').first().text().trim() || null;
      const opp = makeOpp({
        title, bodyText: body + ' residency artist-in-residence',
        source: 'ResArtis', type: 'residency', location,
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.resartis.org${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[ResArtis] failed:', e.message); return []; }
}

async function scrapeAAC(fetch) {
  try {
    const html = await (await fetch('https://www.artistcommunities.org/residencies/find-a-residency', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('.views-row, .residency-item, article, .node').each((_, el) => {
      const title    = $(el).find('h2, h3, .field-title, a').first().text().trim();
      const body     = $(el).text();
      const link     = $(el).find('a').first().attr('href');
      const location = $(el).find('.location, .state, .country').first().text().trim() || 'USA';
      const opp = makeOpp({
        title, bodyText: body + ' residency artist-in-residence fellowship',
        source: 'Alliance of Artists Communities', type: 'residency', location,
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.artistcommunities.org${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[AAC] failed:', e.message); return []; }
}

async function scrapeCaFE(fetch) {
  try {
    const html = await (await fetch('https://www.callforentry.org/festivals_unique_listing.php', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('tr').each((_, el) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;
      const title = $(cells[0]).text().trim();
      const body  = $(el).text();
      const link  = $(el).find('a').first().attr('href');
      if (detectFee(body) === true) return;
      const opp = makeOpp({
        title, bodyText: body + ' open call juried exhibition',
        source: 'CaFÉ', type: 'open_call', location: 'USA',
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.callforentry.org${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[CaFÉ] failed:', e.message); return []; }
}

async function scrapeEFlux(fetch) {
  try {
    const html = await (await fetch('https://www.e-flux.com/announcements/tag/open-calls/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('article, [class*="item"]').each((_, el) => {
      const title = $(el).find('h1, h2, h3, .title').first().text().trim();
      const body  = $(el).text();
      const link  = $(el).find('a').first().attr('href');
      const opp = makeOpp({
        title, bodyText: body, source: 'e-flux', type: 'open_call',
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.e-flux.com${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[e-flux] failed:', e.message); return []; }
}

async function scrapeArtconnect(fetch) {
  try {
    const html = await (await fetch('https://www.artconnect.com/opportunities?type=open-call&fee=free', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('[class*="opportunity"], [class*="card"], article, .listing').each((_, el) => {
      const title    = $(el).find('h2, h3, h4, [class*="title"]').first().text().trim();
      const body     = $(el).text();
      const link     = $(el).find('a').first().attr('href');
      const location = $(el).find('[class*="location"]').first().text().trim() || null;
      if (detectFee(body) === true) return;
      const opp = makeOpp({
        title, bodyText: body, source: 'Artconnect', type: 'open_call', location,
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.artconnect.com${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[Artconnect] failed:', e.message); return []; }
}

async function scrapeTransArtists(fetch) {
  try {
    const html = await (await fetch('https://www.transartists.org/en/residencies?field_fees_value=0', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })).text();
    const $ = cheerio.load(html);
    $('nav, footer, header, script, style').remove();
    const results = [];
    $('.views-row, .residency, article').each((_, el) => {
      const title    = $(el).find('h2, h3, .views-field-title, a').first().text().trim();
      const body     = $(el).text();
      const link     = $(el).find('a').first().attr('href');
      const location = $(el).find('.views-field-field-country, .country').first().text().trim() || null;
      const opp = makeOpp({
        title, bodyText: body + ' residency artist-in-residence',
        source: 'TransArtists', type: 'residency', location,
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.transartists.org${link}` : null,
      });
      if (opp) results.push(opp);
    });
    return dedup(results);
  } catch(e) { console.warn('[TransArtists] failed:', e.message); return []; }
}

// Individual program pages — single focused opportunity per page
const SINGLE_PROGRAM_PAGES = [
  { url:'https://www.macdowell.org/apply',                               type:'residency', source:'MacDowell',                       location:'New Hampshire', signal:'fellowship residency artist-in-residence apply' },
  { url:'https://www.yaddo.org/apply/',                                  type:'residency', source:'Yaddo',                           location:'New York',      signal:'residency artist fellowship apply' },
  { url:'https://headlands.org/program/air/',                            type:'residency', source:'Headlands Center',                location:'California',    signal:'residency artist-in-residence' },
  { url:'https://ucross.org/residency-program/',                         type:'residency', source:'Ucross Foundation',               location:'Wyoming',       signal:'residency artist apply fellowship' },
  { url:'https://ragdale.org/residency/',                                type:'residency', source:'Ragdale',                         location:'Illinois',      signal:'residency artist fellowship apply' },
  { url:'https://millayarts.org/apply/',                                 type:'residency', source:'Millay Arts',                     location:'New York',      signal:'residency artist fellowship apply' },
  { url:'https://www.hambidge.org/residency/',                           type:'residency', source:'Hambidge Center',                 location:'Georgia',       signal:'residency fellowship artist apply' },
  { url:'https://ox-bow.org/residency/',                                 type:'residency', source:'Ox-Bow',                          location:'Michigan',      signal:'residency artist-in-residence apply' },
  { url:'https://artomi.org/residencies/',                               type:'residency', source:'Art Omi',                         location:'New York',      signal:'residency artist open call apply' },
  { url:'https://djerassi.org/apply/',                                   type:'residency', source:'Djerassi',                        location:'California',    signal:'residency artist-in-residence apply' },
  { url:'https://www.vermontstudiocenter.org/fellowships-grants/',       type:'residency', source:'Vermont Studio Center',           location:'Vermont',       signal:'fellowship residency grant artist apply' },
  { url:'https://centrum.org/residencies/',                              type:'residency', source:'Centrum',                         location:'Washington',    signal:'residency artist fellowship apply' },
  { url:'https://montalvoarts.org/programs/sar/',                        type:'residency', source:'Montalvo Arts',                   location:'California',    signal:'residency artist apply fellowship' },
  { url:'https://pioneerworks.org/residency/',                           type:'residency', source:'Pioneer Works',                   location:'New York',      signal:'residency artist-in-residence apply' },
  { url:'https://www.andersonranch.org/programs/artist-in-residence/',   type:'residency', source:'Anderson Ranch',                  location:'Colorado',      signal:'residency artist-in-residence' },
  { url:'https://www.bemiscenter.org/residencies/',                      type:'residency', source:'Bemis Center',                    location:'Nebraska',      signal:'residency artist-in-residence apply' },
  { url:'https://www.narsfoundation.org/international-residency-program/', type:'residency', source:'NARS Foundation',              location:'New York',      signal:'residency artist-in-residence apply' },
  { url:'https://efanyc.org/studio-program/',                            type:'residency', source:'Elizabeth Foundation for the Arts', location:'New York',   signal:'residency studio artist apply' },
  { url:'https://www.wavehill.org/arts/residency/',                      type:'residency', source:'Wave Hill',                       location:'New York',      signal:'residency artist fellowship apply' },
  { url:'https://massmoca.org/opportunity/',                             type:'open_call', source:'MASS MoCA',                       location:'Massachusetts', signal:'open call artist residency apply' },
  { url:'https://www.aarome.org/apply/',                                 type:'residency', source:'American Academy in Rome',        location:'Italy',         signal:'fellowship residency artist apply prize' },
  { url:'https://civitella.org/apply/',                                  type:'residency', source:'Civitella Ranieri',               location:'Italy',         signal:'residency fellowship artist apply' },
  { url:'https://www.bfny.org/en/apply/',                                type:'residency', source:'Bogliasco Foundation',            location:'Italy',         signal:'fellowship residency apply' },
  { url:'https://www.akademie-solitude.de/en/apply/',                    type:'residency', source:'Schloss Solitude',                location:'Germany',       signal:'fellowship residency artist apply' },
  { url:'https://prohelvetia.ch/en/funding/',                            type:'grant',     source:'Pro Helvetia',                    location:'Switzerland',   signal:'grant funding artist apply fellowship' },
  { url:'https://pkf.org/apply/',                                        type:'grant',     source:'Pollock-Krasner Foundation',      location:'USA',           signal:'grant artist apply award fellowship' },
  { url:'https://www.foundationforcontemporaryarts.org/grants/',         type:'grant',     source:'Foundation for Contemporary Arts', location:'USA',          signal:'grant artist fellowship award apply' },
  { url:'https://creative-capital.org/apply/',                           type:'grant',     source:'Creative Capital',                location:'USA',           signal:'grant award artist apply fellowship' },
  { url:'https://artadia.org/apply/',                                    type:'grant',     source:'Artadia',                         location:'USA',           signal:'grant award artist apply' },
  { url:'https://www.joanmitchellfoundation.org/grants',                 type:'grant',     source:'Joan Mitchell Foundation',        location:'USA',           signal:'grant artist fellowship apply award' },
  { url:'https://www.jeromefdn.org/apply',                               type:'grant',     source:'Jerome Foundation',               location:'USA',           signal:'grant fellowship artist apply' },
  { url:'https://www.collegeart.org/opportunities/',                     type:'open_call', source:'College Art Association',         location:'USA',           signal:'open call grant fellowship opportunity award' },
  { url:'https://projectrowhouses.org/round/',                           type:'open_call', source:'Project Row Houses',              location:'Houston',       signal:'open call artist apply round' },
  { url:'https://smackmellon.org/opportunities/',                        type:'open_call', source:'Smack Mellon',                    location:'New York',      signal:'open call artist opportunity apply' },
  { url:'https://socratessculpturepark.org/emerging-artist-fellowship/', type:'open_call', source:'Socrates Sculpture Park',         location:'New York',      signal:'fellowship emerging artist apply' },
  { url:'https://www.bronxmuseum.org/programs/aim/',                     type:'open_call', source:'Bronx Museum AIM',               location:'New York',      signal:'open call artist apply emerging' },
  { url:'https://www.bricartsmedia.org/open-calls',                      type:'open_call', source:'BRIC Arts',                       location:'New York',      signal:'open call artist apply' },
  { url:'https://massculturalcouncil.org/organizations/grants/',         type:'grant',     source:'Mass Cultural Council',           location:'Massachusetts', signal:'grant artist apply fellowship' },
  { url:'https://arts.ca.gov/grants/',                                   type:'grant',     source:'California Arts Council',         location:'California',    signal:'grant artist apply fellowship' },
  { url:'https://www.arts.texas.gov/programs/',                          type:'grant',     source:'Texas Commission on the Arts',    location:'Texas',         signal:'grant artist apply fellowship' },
  { url:'https://oac.ohio.gov/Grantees-and-Partners/Funding-Opportunities', type:'grant', source:'Ohio Arts Council',               location:'Ohio',          signal:'grant artist apply fellowship' },
  { url:'https://www.ncarts.org/grants/',                                type:'grant',     source:'NC Arts Council',                 location:'North Carolina', signal:'grant artist apply fellowship' },
  { url:'https://www.oregonartscommission.org/grants',                   type:'grant',     source:'Oregon Arts Commission',          location:'Oregon',        signal:'grant artist apply fellowship' },
  { url:'https://www.arts.wa.gov/grants/',                               type:'grant',     source:'Washington State Arts',           location:'Washington',    signal:'grant artist apply fellowship' },
  { url:'https://azarts.gov/grants/',                                    type:'grant',     source:'Arizona Commission on the Arts',  location:'Arizona',       signal:'grant artist apply fellowship' },
  { url:'https://www.hcponline.org/programs/grants/',                    type:'grant',     source:'Houston Center for Photography',  location:'Houston',       signal:'grant fellowship artist photography apply' },
  { url:'https://cpw.org/programs/fellowships/',                         type:'grant',     source:'Center for Photography Woodstock', location:'New York',     signal:'fellowship grant photography artist apply' },
];

async function scrapeSinglePage(fetch, config) {
  try {
    const html = await (await fetch(config.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })).text();
    const $ = cheerio.load(html);

    // Aggressively remove navigation and junk
    $('nav, footer, header, aside, .nav, .footer, .header, .sidebar, .menu, .navigation, .breadcrumb, script, style, noscript, [class*="social"], [class*="share"], [id*="nav"], [id*="footer"], [id*="header"]').remove();

    const main = $('main, [role="main"], #content, #main, .main-content, .page-content').first();
    const root = main.length ? main : $('body');
    const results = [];

    const listingSelectors = [
      'article', '[class*="opportunity"]', '[class*="program"]', '[class*="grant"]',
      '[class*="residency"]', '[class*="fellowship"]', '[class*="listing"]',
      '[class*="card"]', 'li.program', 'li.grant', 'li.opportunity',
    ].join(', ');

    root.find(listingSelectors).each((_, el) => {
      const title = $(el).find('h1, h2, h3, h4, [class*="title"]').first().text().trim();
      if (!title || title.length < 10) return;
      const body = $(el).text();
      const link = $(el).find('a').first().attr('href');
      const opp  = makeOpp({
        title, bodyText: body + ' ' + config.signal,
        source: config.source, type: config.type, location: config.location,
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? new URL(link, config.url).href : config.url,
      });
      if (opp) results.push(opp);
    });

    // Fallback: use the page h1 as the opportunity title
    if (results.length === 0) {
      const pageTitle = $('h1').first().text().trim() || $('title').text().trim().split(/[|\-–]/)[0].trim();
      const bodyText  = root.text();
      const opp = makeOpp({
        title: pageTitle, bodyText: bodyText + ' ' + config.signal,
        source: config.source, type: config.type, location: config.location,
        deadline: parseDeadline(bodyText),
        link: config.url,
      });
      if (opp) results.push(opp);
    }

    return dedup(results);
  } catch(e) {
    console.warn(`[${config.source}] failed:`, e.message);
    return [];
  }
}

module.exports = {
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
};
