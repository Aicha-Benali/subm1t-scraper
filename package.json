// scraper.js

const cheerio = require('cheerio');

const FEE_PHRASES = [
  'application fee','entry fee','submission fee',
  'processing fee','admin fee','jury fee',
  'entry cost','usd fee','eur fee'
];
const FREE_PHRASES = [
  'no fee','free to apply','no application fee',
  'free entry','no entry fee','no cost to apply',
  'free of charge','waived fee'
];

function detectFee(text) {
  const t = text.toLowerCase();
  if (FREE_PHRASES.some(p => t.includes(p))) return false;
  if (FEE_PHRASES.some(p => t.includes(p))) return true;
  // dollar amounts near the word "fee"
  if (/\$\d+/.test(t) && t.includes('fee')) return true;
  return null; // unknown
}

function parseDeadline(text) {
  // Matches: "December 15, 2025", "Dec 15 2025", "2025-12-15"
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /([A-Za-z]+ \d{1,2},?\s*\d{4})/,
    /(deadline[:\s]+[A-Za-z]+ \d{1,2},?\s*\d{4})/i
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

// --- Site-specific parsers ---

async function scrapeEFlux(fetch) {
  const html = await (await fetch('https://www.e-flux.com/announcements/')).text();
  const $ = cheerio.load(html);
  const results = [];
  $('article, .announcement').each((_, el) => {
    const title = $(el).find('h1,h2,h3,.title').first().text().trim();
    const body = $(el).text();
    const link = $(el).find('a').first().attr('href');
    const fee = detectFee(body);
    if (fee === false || fee === null) {
      results.push({
        title,
        link: link?.startsWith('http') ? link : `https://www.e-flux.com${link}`,
        source: 'e-flux',
        deadline: parseDeadline(body),
        has_fee: false,
        type: 'open_call',
        tags: [],
        location: null
      });
    }
  });
  return results;
}

async function scrapeCallForEntry(fetch) {
  const html = await (await fetch('https://www.callforentry.org/festivals_unique_listing.php')).text();
  const $ = cheerio.load(html);
  const results = [];
  $('.event-listing, .opportunity-row, tr').each((_, el) => {
    const title = $(el).find('.title, h3, td:first-child').text().trim();
    const body = $(el).text();
    const link = $(el).find('a').first().attr('href');
    if (!title || title.length < 5) return;
    const fee = detectFee(body);
    if (fee !== true) { // include unknown — CaFÉ is mostly free
      results.push({
        title,
        link: link || 'https://www.callforentry.org',
        source: 'CaFÉ',
        deadline: parseDeadline(body),
        has_fee: false,
        type: 'open_call',
        tags: [],
        location: null
      });
    }
  });
  return results;
}

async function scrapeNYFA(fetch) {
  const html = await (await fetch('https://www.nyfa.org/awards-grants/')).text();
  const $ = cheerio.load(html);
  const results = [];
  $('article, .grant-item, .opportunity').each((_, el) => {
    const title = $(el).find('h2,h3,.entry-title').text().trim();
    const body = $(el).text();
    const link = $(el).find('a').first().attr('href');
    if (!title) return;
    results.push({
      title,
      link: link?.startsWith('http') ? link : `https://www.nyfa.org${link}`,
      source: 'NYFA',
      deadline: parseDeadline(body),
      has_fee: false,
      type: 'grant',
      tags: [],
      location: 'USA'
    });
  });
  return results;
}

// Generic scraper for simple sites
async function scrapeGeneric(fetch, siteConfig) {
  try {
    const html = await (await fetch(siteConfig.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SUBM1T-bot/1.0; +https://subm1t.art)' }
    })).text();
    const $ = cheerio.load(html);
    const results = [];

    $(siteConfig.selector || 'article, .opportunity, .grant, .residency, li').each((_, el) => {
      const title = $(el).find(siteConfig.titleSelector || 'h1,h2,h3,a').first().text().trim();
      const body = $(el).text();
      const link = $(el).find('a').first().attr('href') || '';

      if (!title || title.length < 8 || title.length > 200) return;

      const fee = detectFee(body);
      if (fee === true) return; // definitely has fee, skip

      results.push({
        title,
        link: link.startsWith('http') ? link : `${new URL(siteConfig.url).origin}${link}`,
        source: siteConfig.name,
        deadline: parseDeadline(body),
        has_fee: false,
        type: siteConfig.type || 'open_call',
        tags: siteConfig.tags || [],
        location: siteConfig.location || null
      });
    });

    return results;
  } catch (err) {
    console.warn(`[${siteConfig.name}] failed:`, err.message);
    return [];
  }
}

// All 100 sources
const GENERIC_SITES = [
  { name:'ResArtis', url:'https://www.resartis.org/residencies/', type:'residency', tags:['residency'] },
  { name:'Alliance of Artists Communities', url:'https://www.artistcommunities.org/opportunities', type:'residency' },
  { name:'TransArtists', url:'https://www.transartists.org/en/residencies', type:'residency' },
  { name:'MacDowell', url:'https://www.macdowell.org/apply', type:'residency', tags:['residency'] },
  { name:'Yaddo', url:'https://www.yaddo.org/apply/', type:'residency' },
  { name:'Headlands', url:'https://headlands.org/program/air/', type:'residency' },
  { name:'Skowhegan', url:'https://www.skowheganart.org/about/apply/', type:'residency' },
  { name:'Ucross', url:'https://ucross.org/residency-program/', type:'residency' },
  { name:'Vermont Studio Center', url:'https://www.vermontstudiocenter.org/fellowships-grants/', type:'residency' },
  { name:'Ragdale', url:'https://ragdale.org/residency/', type:'residency' },
  { name:'Lightwork', url:'https://lightwork.org/programs/artist-in-residence/', type:'residency' },
  { name:'Pioneer Works', url:'https://pioneerworks.org/residency/', type:'residency' },
  { name:'Eyebeam', url:'https://eyebeam.org/apply/', type:'residency' },
  { name:'Rhizome', url:'https://rhizome.org/opportunities/', type:'open_call' },
  { name:'Hyperallergic', url:'https://hyperallergic.com/opportunities/', type:'open_call' },
  { name:'Artsy Editorial', url:'https://www.artsy.net/shows', type:'exhibition' },
  { name:'Frieze', url:'https://www.frieze.com/jobs-and-opportunities', type:'open_call' },
  { name:'Artforum', url:'https://www.artforum.com/opportunities', type:'open_call' },
  { name:'Artrabbit', url:'https://www.artrabbit.com/events', type:'exhibition' },
  { name:'Artconnect', url:'https://www.artconnect.com/opportunities', type:'open_call' },
  { name:'NEA', url:'https://www.arts.gov/grants', type:'grant', tags:['grant'], location:'USA' },
  { name:'NYFA Awards', url:'https://www.nyfa.org/awards-grants/', type:'grant', location:'USA' },
  { name:'Pollock-Krasner', url:'https://pkf.org/apply/', type:'grant', location:'USA' },
  { name:'Foundation Contemporary Arts', url:'https://www.foundationforcontemporaryarts.org/grants/', type:'grant' },
  { name:'Creative Capital', url:'https://creative-capital.org/apply/', type:'grant' },
  { name:'Artadia', url:'https://artadia.org/apply/', type:'grant' },
  { name:'Joan Mitchell Foundation', url:'https://www.joanmitchellfoundation.org/grants', type:'grant' },
  { name:'Jerome Foundation', url:'https://www.jeromefdn.org/apply', type:'grant' },
  { name:'Awesome Foundation Arts', url:'https://www.awesomefoundation.org/en/about_us', type:'grant' },
  { name:'College Art Association', url:'https://www.collegeart.org/opportunities/', type:'open_call' },
  { name:'Art in America', url:'https://www.artnews.com/opportunities/', type:'open_call' },
  { name:'Wooloo', url:'https://wooloo.org/open-calls/', type:'open_call' },
  { name:'On the Move', url:'https://www.on-the-move.org/grants/', type:'grant' },
  { name:'Arts Council England', url:'https://www.artscouncil.org.uk/our-open-funds', type:'grant', location:'UK' },
  { name:'British Council Arts', url:'https://www.britishcouncil.org/arts/opportunities', type:'grant', location:'UK' },
  { name:'Arts Council Ireland', url:'https://www.artscouncil.ie/Funds/', type:'grant', location:'Ireland' },
  { name:'Canada Council', url:'https://canadacouncil.ca/funding', type:'grant', location:'Canada' },
  { name:'Australia Council', url:'https://www.australiacouncil.gov.au/funding/', type:'grant', location:'Australia' },
  { name:'Pro Helvetia', url:'https://prohelvetia.ch/en/funding/', type:'grant', location:'Switzerland' },
  { name:'Goethe Institut', url:'https://www.goethe.de/en/kul/bku.html', type:'grant', location:'Germany' },
  { name:'IASPIS', url:'https://iaspis.se/en/apply/', type:'residency', location:'Sweden' },
  { name:'Cité des Arts Paris', url:'https://www.citedesartsparis.fr/en/calls-for-applications', type:'residency', location:'France' },
  { name:'Schloss Solitude', url:'https://www.akademie-solitude.de/en/apply/', type:'residency', location:'Germany' },
  { name:'Djerassi', url:'https://djerassi.org/apply/', type:'residency', location:'USA' },
  { name:'MASS MoCA', url:'https://massmoca.org/opportunity/', type:'residency', location:'USA' },
  { name:'Wave Hill', url:'https://www.wavehill.org/arts/residency/', type:'residency', location:'USA' },
  { name:'Montalvo Arts', url:'https://montalvoarts.org/programs/sar/', type:'residency', location:'USA' },
  { name:'Anderson Ranch', url:'https://www.andersonranch.org/programs/artist-in-residence/', type:'residency' },
  { name:'Centrum', url:'https://centrum.org/residencies/', type:'residency', location:'USA' },
  { name:'Millay Arts', url:'https://millayarts.org/apply/', type:'residency', location:'USA' },
  // State arts councils
  { name:'NYSCA', url:'https://www.nysca.org/public/guidelines/', type:'grant', location:'New York' },
  { name:'Mass Cultural Council', url:'https://massculturalcouncil.org/organizations/grants/', type:'grant', location:'Massachusetts' },
  { name:'California Arts Council', url:'https://arts.ca.gov/grants/', type:'grant', location:'California' },
  { name:'Texas Commission Arts', url:'https://www.arts.texas.gov/programs/', type:'grant', location:'Texas' },
  { name:'Illinois Arts Council', url:'https://arts.illinois.gov/grants-programs', type:'grant', location:'Illinois' },
  { name:'Pennsylvania Council Arts', url:'https://www.arts.pa.gov/Opportunities/', type:'grant', location:'Pennsylvania' },
  { name:'Ohio Arts Council', url:'https://oac.ohio.gov/Grantees-and-Partners/Funding-Opportunities', type:'grant', location:'Ohio' },
  { name:'Florida Division Arts', url:'https://dos.fl.gov/cultural/grants/', type:'grant', location:'Florida' },
  { name:'Georgia Council Arts', url:'https://www.gca.georgia.gov/grants', type:'grant', location:'Georgia' },
  { name:'Virginia Commission Arts', url:'https://www.arts.virginia.gov/grants/', type:'grant', location:'Virginia' },
  { name:'NC Arts Council', url:'https://www.ncarts.org/grants/', type:'grant', location:'North Carolina' },
  { name:'Michigan Arts Culture', url:'https://www.michiganadvantage.org/arts-culture/', type:'grant', location:'Michigan' },
  { name:'Minnesota State Arts', url:'https://arts.mn.gov/grants/', type:'grant', location:'Minnesota' },
  { name:'Colorado Creative Industries', url:'https://oedit.colorado.gov/colorado-creative-industries', type:'grant', location:'Colorado' },
  { name:'Oregon Arts Commission', url:'https://www.oregonartscommission.org/grants', type:'grant', location:'Oregon' },
  { name:'Washington State Arts', url:'https://www.arts.wa.gov/grants/', type:'grant', location:'Washington' },
  { name:'Arizona Commission Arts', url:'https://azarts.gov/grants/', type:'grant', location:'Arizona' },
  { name:'Nevada Arts Council', url:'https://nac.nevadaculture.org/grants/', type:'grant', location:'Nevada' },
  // More open calls
  { name:'Submarine Channel', url:'https://submarinechannel.com/callforsubmissions/', type:'open_call' },
  { name:'Aesthetica Magazine', url:'https://www.aestheticamagazine.com/art-prize/', type:'competition' },
  { name:'Lensculture', url:'https://www.lensculture.com/competitions', type:'competition', tags:['photography'] },
  { name:'Photolucida', url:'https://www.photolucida.org/portfolio-reviews/', type:'open_call', tags:['photography'] },
  { name:'Houston Center Photography', url:'https://www.hcponline.org/programs/grants/', type:'grant', tags:['photography'] },
  { name:'Photo Review', url:'https://www.photoreview.org/competitions/', type:'competition', tags:['photography'] },
  { name:'Center for Photography Woodstock', url:'https://cpw.org/programs/fellowships/', type:'grant' },
  { name:'Society Photographic Education', url:'https://spenational.org/opportunities/', type:'open_call' },
  { name:'National Arts Club', url:'https://nationalartsclub.org/opportunities', type:'open_call' },
  { name:'American Academy Rome', url:'https://www.aarome.org/apply/', type:'residency', location:'Italy' },
  { name:'Bogliasco Foundation', url:'https://www.bfny.org/en/apply/', type:'residency', location:'Italy' },
  { name:'Bellagio Center', url:'https://www.rockefellerfoundation.org/bellagio-center/residency-program/', type:'residency' },
  { name:'Civitella Ranieri', url:'https://civitella.org/apply/', type:'residency', location:'Italy' },
  { name:'Camargo Foundation', url:'https://camargoproject.org/apply/', type:'residency', location:'France' },
  { name:'Hambidge Center', url:'https://www.hambidge.org/residency/', type:'residency', location:'Georgia' },
  { name:'Brush Creek Foundation', url:'https://brushcreekfoundation.com/residency/', type:'residency', location:'Wyoming' },
  { name:'Marble House Project', url:'https://www.marblehouseproject.org/residency/', type:'residency' },
  { name:'Ox-Bow School Art', url:'https://ox-bow.org/residency/', type:'residency', location:'Michigan' },
  { name:'RedLine Contemporary Art', url:'https://redlinedenver.org/artist-in-residence/', type:'residency', location:'Colorado' },
  { name:'AIM Program Bronx Museum', url:'https://www.bronxmuseum.org/programs/aim/', type:'open_call', location:'New York' },
  { name:'BRIC Arts', url:'https://www.bricartsmedia.org/open-calls', type:'open_call', location:'New York' },
  { name:'Smack Mellon', url:'https://smackmellon.org/opportunities/', type:'open_call', location:'New York' },
  { name:'Socrates Sculpture Park', url:'https://socratessculpturepark.org/emerging-artist-fellowship/', type:'open_call', location:'New York' },
  { name:'Art Omi', url:'https://artomi.org/residencies/', type:'residency', location:'New York' },
  { name:'Flux Factory', url:'https://www.fluxfactory.org/open-calls/', type:'open_call', location:'New York' },
  { name:'chashama', url:'https://chashama.org/programs/', type:'open_call', location:'New York' },
  { name:'Elizabeth Foundation Arts', url:'https://efanyc.org/studio-program/', type:'residency', location:'New York' },
  { name:'Lower East Side Printshop', url:'https://lesprintshop.org/programs/keyholder/', type:'residency', location:'New York' },
  { name:'NARS Foundation', url:'https://www.narsfoundation.org/international-residency-program/', type:'residency', location:'New York' },
  { name:'Bemis Center', url:'https://www.bemiscenter.org/residencies/', type:'residency', location:'Omaha' },
  { name:'Elsewhere Museum', url:'https://www.elsewheremuseum.org/residency', type:'residency', location:'North Carolina' },
  { name:'Project Row Houses', url:'https://projectrowhouses.org/round/', type:'open_call', location:'Houston' },
];

module.exports = { scrapeGeneric, scrapeEFlux, scrapeCallForEntry, scrapeNYFA, GENERIC_SITES, detectFee };
