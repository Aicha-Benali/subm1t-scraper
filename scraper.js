// scraper.js — SUBM1T. smart scraper

const cheerio = require('cheerio');

// ── Junk detection ────────────────────────────────────────────────────────
// Titles that are definitely not art opportunities

const JUNK_PATTERNS = [
  /^follow us/i, /^subscribe/i, /^newsletter/i, /^sign up/i, /^log in/i,
  /^login/i, /^register/i, /^contact us/i, /^about us/i, /^home$/i,
  /^search$/i, /^menu$/i, /^navigation/i, /^skip to/i, /^back to/i,
  /^share$/i, /^tweet$/i, /^facebook$/i, /^instagram$/i, /^twitter$/i,
  /^youtube$/i, /^linkedin$/i, /^pinterest$/i, /^tiktok$/i,
  /^get a /i, /^buy /i, /^shop /i, /^donate$/i, /^give now/i,
  /^our campus/i, /^our mission/i, /^our team/i, /^our work/i,
  /^press release/i, /^privacy policy/i, /^terms of/i, /^cookie/i,
  /^copyright/i, /^all rights/i, /^powered by/i,
  /^read more$/i, /^learn more$/i, /^click here$/i, /^more info/i,
  /^loading/i, /^error/i, /^404/i, /^page not found/i,
  /^\d+$/, // just a number
  /^[^a-zA-Z]*$/, // no letters at all
];

// Words that strongly suggest it IS an art opportunity
const OPPORTUNITY_SIGNALS = [
  'open call', 'call for', 'residency', 'fellowship', 'grant', 'award',
  'prize', 'exhibition', 'commission', 'competition', 'submit', 'submission',
  'apply', 'application', 'artist', 'artwork', 'creative', 'proposal',
  'opportunity', 'program', 'programme', 'scholarship', 'stipend',
  'fund', 'support', 'emerging', 'studio', 'public art', 'mural',
  'performance', 'installation', 'residences', 'retreat', 'workshop',
  'cohort', 'incubator', 'accelerator', 'mentorship', 'showcase',
];

// Words that disqualify a result — not art-related
const DISQUALIFY_WORDS = [
  'mortgage', 'insurance', 'real estate', 'cryptocurrency', 'bitcoin',
  'stock market', 'forex', 'trading', 'poker', 'casino', 'gambling',
  'weight loss', 'diet pill', 'supplement', 'payday loan', 'cash advance',
  'seo service', 'backlink', 'click here to win', 'you have been selected',
  'birth certificate', 'passport', 'visa application', 'immigration',
  'plumber', 'electrician', 'roofing', 'pest control', 'car insurance',
];

function isJunkTitle(title) {
  if (!title || title.length < 8 || title.length > 300) return true;
  if (JUNK_PATTERNS.some(p => p.test(title.trim()))) return true;
  return false;
}

function isRelevant(title, bodyText) {
  const combined = (title + ' ' + (bodyText || '')).toLowerCase();

  // Hard disqualify
  if (DISQUALIFY_WORDS.some(w => combined.includes(w))) return false;

  // Must have at least one opportunity signal in title OR body
  const titleLower = title.toLowerCase();
  const hasSignal =
    OPPORTUNITY_SIGNALS.some(s => titleLower.includes(s)) ||
    OPPORTUNITY_SIGNALS.some(s => combined.includes(s));

  return hasSignal;
}

// ── Fee detection ─────────────────────────────────────────────────────────

const FEE_PHRASES = [
  'application fee', 'entry fee', 'submission fee', 'processing fee',
  'admin fee', 'jury fee', 'entry cost', 'registration fee',
  'handling fee', 'reading fee',
];
const FREE_PHRASES = [
  'no fee', 'free to apply', 'no application fee', 'free entry',
  'no entry fee', 'no cost to apply', 'free of charge', 'waived fee',
  'no submission fee', 'fee-free', 'feefree',
];

function detectFee(text) {
  const t = (text || '').toLowerCase();
  if (FREE_PHRASES.some(p => t.includes(p))) return false;
  if (FEE_PHRASES.some(p => t.includes(p))) return true;
  if (/\$\s*\d+/.test(t) && t.includes('fee')) return true;
  return null; // unknown — include by default (we only exclude confirmed fees)
}

// ── Deadline parsing ──────────────────────────────────────────────────────

function parseDeadline(text) {
  if (!text) return null;
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /deadline[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /due[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /closes?[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /([A-Za-z]+ \d{1,2},?\s*202[4-9])/,
    /([A-Za-z]+ \d{1,2},?\s*203\d)/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d) && d > new Date()) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

// ── Clean and validate a candidate opportunity ────────────────────────────

function validateOpp(opp) {
  if (!opp || !opp.title) return null;

  const title = opp.title.trim().replace(/\s+/g, ' ');

  if (isJunkTitle(title)) return null;
  if (!isRelevant(title, opp.bodyText || '')) return null;
  if (detectFee(opp.bodyText || '') === true) return null; // confirmed fee = skip

  // Deadline in the past = skip (unless null)
  if (opp.deadline) {
    const d = new Date(opp.deadline);
    if (!isNaN(d) && d < new Date()) return null;
  }

  return {
    title,
    type:     opp.type     || 'open_call',
    location: opp.location || null,
    deadline: opp.deadline || null,
    link:     opp.link     || null,
    has_fee:  false,
    tags:     opp.tags     || [],
    source:   opp.source   || 'unknown',
  };
}

// ── Site-specific parsers ─────────────────────────────────────────────────
// These target the ACTUAL listing elements on each page, not nav/footer junk

async function scrapeEFlux(fetch) {
  try {
    const html = await (await fetch('https://www.e-flux.com/announcements/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SUBM1T-bot/1.0)' }
    })).text();
    const $ = cheerio.load(html);
    const results = [];

    // e-flux uses article elements with specific class
    $('article, .article, [class*="announcement"]').each((_, el) => {
      const title = $(el).find('h1, h2, h3, .title, [class*="title"]').first().text().trim();
      const body  = $(el).text();
      const link  = $(el).find('a').first().attr('href');
      const validated = validateOpp({
        title, bodyText: body, source: 'e-flux', type: 'open_call',
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.e-flux.com${link}` : null,
      });
      if (validated) results.push(validated);
    });
    return results;
  } catch(e) { console.warn('[e-flux] failed:', e.message); return []; }
}

async function scrapeNYFA(fetch) {
  try {
    const html = await (await fetch('https://www.nyfa.org/awards-grants/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SUBM1T-bot/1.0)' }
    })).text();
    const $ = cheerio.load(html);
    const results = [];

    // NYFA listing items
    $('article, .opportunity, .grant-item, .post, .listing-item').each((_, el) => {
      const title = $(el).find('h2, h3, h4, .entry-title, a').first().text().trim();
      const body  = $(el).text();
      const link  = $(el).find('a').first().attr('href');
      const validated = validateOpp({
        title, bodyText: body, source: 'NYFA', type: 'grant', location: 'USA',
        deadline: parseDeadline(body),
        link: link?.startsWith('http') ? link : link ? `https://www.nyfa.org${link}` : null,
      });
      if (validated) results.push(validated);
    });
    return results;
  } catch(e) { console.warn('[NYFA] failed:', e.message); return []; }
}

async function scrapeCaFE(fetch) {
  try {
    const html = await (await fetch('https://www.callforentry.org/festivals_unique_listing.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SUBM1T-bot/1.0)' }
    })).text();
    const $ = cheerio.load(html);
    const results = [];

    // CaFÉ table rows
    $('tr, .listing-row, [class*="event"]').each((_, el) => {
      const title = $(el).find('.title, h3, td:first-child, a').first().text().trim();
      const body  = $(el).text();
      const link  = $(el).find('a').first().attr('href');
      if (!title || title.length < 5) return;
      const fee = detectFee(body);
      if (fee === true) return;
      const validated = validateOpp({
        title, bodyText: body, source: 'CaFÉ', type: 'open_call',
        deadline: parseDeadline(body),
        link: link || 'https://www.callforentry.org',
      });
      if (validated) results.push(validated);
    });
    return results;
  } catch(e) { console.warn('[CaFÉ] failed:', e.message); return []; }
}

// ── Generic scraper — only grabs from content areas, skips nav/footer ─────

async function scrapeGeneric(fetch, siteConfig) {
  try {
    const html = await (await fetch(siteConfig.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SUBM1T-bot/1.0; +https://subm1t.art)' },
      timeout: 10000,
    })).text();

    const $ = cheerio.load(html);

    // Remove nav, footer, header, sidebar — these produce junk titles
    $('nav, footer, header, aside, .nav, .footer, .header, .sidebar, .menu, .navigation, .breadcrumb, .pagination, script, style, noscript').remove();

    const results = [];

    // Try to find the main content area first
    const contentArea = $('main, [role="main"], #content, #main, .content, .main, article').first();
    const root = contentArea.length ? contentArea : $('body');

    // Only grab elements that look like list items or cards, not raw paragraphs
    const selectors = siteConfig.selector ||
      'article, .opportunity, .grant, .residency, .fellowship, .award, .call, .listing, .post, li.item, .card, [class*="opportunity"], [class*="grant"], [class*="residency"], [class*="listing"], [class*="call-for"]';

    root.find(selectors).each((_, el) => {
      const title = $(el).find(
        siteConfig.titleSelector || 'h1, h2, h3, h4, .title, [class*="title"], a'
      ).first().text().trim();

      const body = $(el).text();
      const rawLink = $(el).find('a').first().attr('href') || '';
      const link = rawLink.startsWith('http')
        ? rawLink
        : rawLink ? `${new URL(siteConfig.url).origin}${rawLink}` : null;

      const validated = validateOpp({
        title, bodyText: body,
        source:   siteConfig.name,
        type:     siteConfig.type     || 'open_call',
        location: siteConfig.location || null,
        tags:     siteConfig.tags     || [],
        deadline: parseDeadline(body),
        link,
      });

      if (validated) results.push(validated);
    });

    // Deduplicate by title within this site's results
    const seen = new Set();
    return results.filter(r => {
      const key = r.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  } catch(e) {
    console.warn(`[${siteConfig.name}] failed:`, e.message);
    return [];
  }
}

// ── Site list ─────────────────────────────────────────────────────────────

const GENERIC_SITES = [
  { name:'Alliance of Artists Communities', url:'https://www.artistcommunities.org/opportunities', type:'residency' },
  { name:'TransArtists', url:'https://www.transartists.org/en/residencies', type:'residency' },
  { name:'MacDowell', url:'https://www.macdowell.org/apply', type:'residency', tags:['residency'] },
  { name:'Yaddo', url:'https://www.yaddo.org/apply/', type:'residency' },
  { name:'Headlands', url:'https://headlands.org/program/air/', type:'residency' },
  { name:'Skowhegan', url:'https://www.skowheganart.org/about/apply/', type:'residency' },
  { name:'Ucross', url:'https://ucross.org/residency-program/', type:'residency' },
  { name:'Vermont Studio Center', url:'https://www.vermontstudiocenter.org/fellowships-grants/', type:'residency' },
  { name:'Ragdale', url:'https://ragdale.org/residency/', type:'residency' },
  { name:'Pioneer Works', url:'https://pioneerworks.org/residency/', type:'residency' },
  { name:'Rhizome', url:'https://rhizome.org/opportunities/', type:'open_call' },
  { name:'Hyperallergic', url:'https://hyperallergic.com/opportunities/', type:'open_call' },
  { name:'Frieze', url:'https://www.frieze.com/jobs-and-opportunities', type:'open_call' },
  { name:'Artconnect', url:'https://www.artconnect.com/opportunities', type:'open_call' },
  { name:'NEA', url:'https://www.arts.gov/grants', type:'grant', tags:['grant'], location:'USA' },
  { name:'Pollock-Krasner', url:'https://pkf.org/apply/', type:'grant', location:'USA' },
  { name:'Foundation Contemporary Arts', url:'https://www.foundationforcontemporaryarts.org/grants/', type:'grant' },
  { name:'Creative Capital', url:'https://creative-capital.org/apply/', type:'grant' },
  { name:'Artadia', url:'https://artadia.org/apply/', type:'grant' },
  { name:'Joan Mitchell Foundation', url:'https://www.joanmitchellfoundation.org/grants', type:'grant' },
  { name:'Jerome Foundation', url:'https://www.jeromefdn.org/apply', type:'grant' },
  { name:'College Art Association', url:'https://www.collegeart.org/opportunities/', type:'open_call' },
  { name:'Wooloo', url:'https://wooloo.org/open-calls/', type:'open_call' },
  { name:'On the Move', url:'https://www.on-the-move.org/grants/', type:'grant' },
  { name:'Arts Council England', url:'https://www.artscouncil.org.uk/our-open-funds', type:'grant', location:'UK' },
  { name:'Arts Council Ireland', url:'https://www.artscouncil.ie/Funds/', type:'grant', location:'Ireland' },
  { name:'Canada Council', url:'https://canadacouncil.ca/funding', type:'grant', location:'Canada' },
  { name:'Australia Council', url:'https://www.australiacouncil.gov.au/funding/', type:'grant', location:'Australia' },
  { name:'American Academy Rome', url:'https://www.aarome.org/apply/', type:'residency', location:'Italy' },
  { name:'Civitella Ranieri', url:'https://civitella.org/apply/', type:'residency', location:'Italy' },
  { name:'Schloss Solitude', url:'https://www.akademie-solitude.de/en/apply/', type:'residency', location:'Germany' },
  { name:'Djerassi', url:'https://djerassi.org/apply/', type:'residency', location:'USA' },
  { name:'MASS MoCA', url:'https://massmoca.org/opportunity/', type:'residency', location:'USA' },
  { name:'Art Omi', url:'https://artomi.org/residencies/', type:'residency', location:'New York' },
  { name:'NYSCA', url:'https://www.nysca.org/public/guidelines/', type:'grant', location:'New York' },
  { name:'Mass Cultural Council', url:'https://massculturalcouncil.org/organizations/grants/', type:'grant', location:'Massachusetts' },
  { name:'California Arts Council', url:'https://arts.ca.gov/grants/', type:'grant', location:'California' },
  { name:'Texas Commission Arts', url:'https://www.arts.texas.gov/programs/', type:'grant', location:'Texas' },
  { name:'Illinois Arts Council', url:'https://arts.illinois.gov/grants-programs', type:'grant', location:'Illinois' },
  { name:'Ohio Arts Council', url:'https://oac.ohio.gov/Grantees-and-Partners/Funding-Opportunities', type:'grant', location:'Ohio' },
  { name:'Florida Division Arts', url:'https://dos.fl.gov/cultural/grants/', type:'grant', location:'Florida' },
  { name:'NC Arts Council', url:'https://www.ncarts.org/grants/', type:'grant', location:'North Carolina' },
  { name:'Oregon Arts Commission', url:'https://www.oregonartscommission.org/grants', type:'grant', location:'Oregon' },
  { name:'Washington State Arts', url:'https://www.arts.wa.gov/grants/', type:'grant', location:'Washington' },
  { name:'Arizona Commission Arts', url:'https://azarts.gov/grants/', type:'grant', location:'Arizona' },
  { name:'Houston Center Photography', url:'https://www.hcponline.org/programs/grants/', type:'grant', location:'Houston', tags:['photography'] },
  { name:'Center Photography Woodstock', url:'https://cpw.org/programs/fellowships/', type:'grant', tags:['photography'] },
  { name:'National Arts Club', url:'https://nationalartsclub.org/opportunities', type:'open_call' },
  { name:'Bemis Center', url:'https://www.bemiscenter.org/residencies/', type:'residency', location:'Omaha' },
  { name:'Project Row Houses', url:'https://projectrowhouses.org/round/', type:'open_call', location:'Houston' },
  { name:'BRIC Arts', url:'https://www.bricartsmedia.org/open-calls', type:'open_call', location:'New York' },
  { name:'Smack Mellon', url:'https://smackmellon.org/opportunities/', type:'open_call', location:'New York' },
  { name:'Socrates Sculpture Park', url:'https://socratessculpturepark.org/emerging-artist-fellowship/', type:'open_call', location:'New York' },
  { name:'AIM Bronx Museum', url:'https://www.bronxmuseum.org/programs/aim/', type:'open_call', location:'New York' },
  { name:'Flux Factory', url:'https://www.fluxfactory.org/open-calls/', type:'open_call', location:'New York' },
  { name:'NARS Foundation', url:'https://www.narsfoundation.org/international-residency-program/', type:'residency', location:'New York' },
  { name:'Elizabeth Foundation Arts', url:'https://efanyc.org/studio-program/', type:'residency', location:'New York' },
  { name:'Hambidge Center', url:'https://www.hambidge.org/residency/', type:'residency', location:'Georgia' },
  { name:'Anderson Ranch', url:'https://www.andersonranch.org/programs/artist-in-residence/', type:'residency' },
  { name:'Ox-Bow', url:'https://ox-bow.org/residency/', type:'residency', location:'Michigan' },
  { name:'Wave Hill', url:'https://www.wavehill.org/arts/residency/', type:'residency', location:'New York' },
  { name:'Montalvo Arts', url:'https://montalvoarts.org/programs/sar/', type:'residency', location:'California' },
  { name:'Centrum', url:'https://centrum.org/residencies/', type:'residency', location:'Washington' },
  { name:'Millay Arts', url:'https://millayarts.org/apply/', type:'residency', location:'New York' },
  { name:'Cité des Arts', url:'https://www.citedesartsparis.fr/en/calls-for-applications', type:'residency', location:'France' },
  { name:'Bogliasco Foundation', url:'https://www.bfny.org/en/apply/', type:'residency', location:'Italy' },
  { name:'Camargo Foundation', url:'https://camargoproject.org/apply/', type:'residency', location:'France' },
  { name:'IASPIS', url:'https://iaspis.se/en/apply/', type:'residency', location:'Sweden' },
  { name:'Pro Helvetia', url:'https://prohelvetia.ch/en/funding/', type:'grant', location:'Switzerland' },
];

module.exports = {
  scrapeEFlux,
  scrapeNYFA,
  scrapeCaFE,
  scrapeGeneric,
  GENERIC_SITES,
  validateOpp,
  detectFee,
};
