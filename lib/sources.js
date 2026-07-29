// lib/sources.js — Tier 1: real scraping.
//
// Two kinds of sources here:
//
// 1) SINGLE_PROGRAM_PAGES + scrapeSinglePage(): re-fetches each known org's own apply
//    page (the ones that used to just be a hardcoded, slowly-going-stale array) and
//    scans the live text for a current deadline and fee mentions. This is generic —
//    it doesn't need per-site CSS selectors, just regex over visible text — so it
//    should work reasonably well without site-specific tuning.
//
// 2) scrapeCaFE / scrapeSubmittable / scrapeNYFASource / etc.: listing-page scrapers
//    for aggregator sites that list many calls at once. These DO need CSS selectors,
//    which I could not verify against live HTML (my sandbox can't reach these
//    domains). Each is marked "// VERIFY" at the selector — open the page's devtools,
//    confirm/adjust the selector, and you're good. Until verified they're written to
//    fail soft (log a warning, return []) rather than crash the whole run.

const cheerio = require("cheerio");
const { isValid, looksFeeFree } = require("./validate");

const UA =
  "Mozilla/5.0 (compatible; SUBM1Tbot/1.0; +https://subm1t.example/about)";

async function fetchHtml(fetch, url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// 1) Known single-org pages — generic deadline/fee re-check, no selectors needed
// ---------------------------------------------------------------------------

// Seeded from the original static list. `deadline` here is a FALLBACK used only if
// the live page scan below can't find a clearer date — the live scan takes priority.
const SINGLE_PROGRAM_PAGES = [
  { source: "macdowell", title: "MacDowell Artist Residency", type: "residency", deadline: "2026-09-15", location: "New Hampshire, USA", is_remote: false, link: "https://www.macdowell.org/apply", tags: ["painting", "drawing", "sculpture", "photography"] },
  { source: "yaddo", title: "Yaddo Artist Residency", type: "residency", deadline: "2026-10-01", location: "Saratoga Springs, New York", is_remote: false, link: "https://yaddo.org/apply/", tags: ["painting", "sculpture", "photography", "established"] },
  { source: "houston_arts_alliance", title: "Houston Arts Alliance Individual Artist Grant", type: "grant", deadline: "2026-07-15", location: "Houston, Texas", is_remote: false, link: "https://www.houstonartsalliance.com/grants/", tags: ["painting", "drawing", "sculpture", "photography", "digital", "houston"] },
  { source: "nars_foundation", title: "NARS Foundation International Artist Residency", type: "residency", deadline: "2026-07-01", location: "Brooklyn, New York", is_remote: false, link: "https://www.narsfoundation.org/residency-program", tags: ["painting", "sculpture", "installation", "drawing", "emerging"] },
  { source: "skowhegan", title: "Skowhegan School of Painting and Sculpture", type: "residency", deadline: "2026-06-20", location: "Skowhegan, Maine", is_remote: false, link: "https://www.skowheganart.org/apply/", tags: ["painting", "sculpture", "drawing", "emerging", "student"] },
  { source: "creative_capital", title: "Creative Capital Visual Arts Grant", type: "grant", deadline: "2026-08-01", location: "USA (national)", is_remote: true, link: "https://creative-capital.org/apply/", tags: ["digital", "video", "performance", "installation", "mid-career"] },
  { source: "pollock_krasner", title: "Pollock-Krasner Foundation Grant", type: "grant", deadline: "2026-07-30", location: "International", is_remote: true, link: "https://www.pkf.org/apply/", tags: ["painting", "drawing", "printmaking", "sculpture", "established"] },
  { source: "headlands", title: "Headlands Center for the Arts Residency", type: "residency", deadline: "2026-09-01", location: "Marin Headlands, California", is_remote: false, link: "https://headlands.org/program/artist-in-residence/", tags: ["painting", "drawing", "photography", "sculpture", "installation", "video"] },
  { source: "eyebeam", title: "Eyebeam Digital Arts Fellowship", type: "residency", deadline: "2026-07-10", location: "New York City", is_remote: false, link: "https://www.eyebeam.org/fellowships/", tags: ["digital", "video", "installation", "technology", "emerging"] },
  { source: "nyfa_fellowship", title: "New York Foundation for the Arts Fellowship", type: "grant", deadline: "2026-07-20", location: "New York State", is_remote: false, link: "https://www.nyfa.org/awards-grants/nyfa-artists-fellowships/", tags: ["painting", "drawing", "printmaking", "sculpture", "ceramics", "established"] },
  { source: "rauschenberg", title: "Rauschenberg Foundation Artist as Activist Fellowship", type: "grant", deadline: "2026-08-15", location: "International", is_remote: true, link: "https://rauschenbergfoundation.org/grants", tags: ["photography", "video", "installation", "performance", "political"] },
  { source: "smack_mellon", title: "Smack Mellon Open Studio Program", type: "residency", deadline: "2026-06-30", location: "Brooklyn, New York", is_remote: false, link: "https://www.smackmellon.org/studio-program/", tags: ["painting", "sculpture", "installation", "video", "performance", "emerging"] },
  { source: "frieze", title: "Frieze Artist Award", type: "open-call", deadline: "2026-10-15", location: "International", is_remote: true, link: "https://www.frieze.com/artist-award", tags: ["installation", "sculpture", "digital", "video", "performance", "emerging"] },
  { source: "bemis", title: "Bemis Center for Contemporary Arts Residency", type: "residency", deadline: "2026-08-20", location: "Omaha, Nebraska", is_remote: false, link: "https://www.bemiscenter.org/residencies/apply", tags: ["painting", "sculpture", "installation", "video", "photography"] },
  { source: "djerassi", title: "Djerassi Resident Artists Program", type: "residency", deadline: "2026-09-10", location: "Woodside, California", is_remote: false, link: "https://www.djerassi.org/apply/", tags: ["painting", "drawing", "sculpture", "photography"] },
  { source: "vermont_studio_center", title: "Vermont Studio Center Artist Fellowship", type: "residency", deadline: "2026-06-15", location: "Johnson, Vermont", is_remote: false, link: "https://www.vermontstudiocenter.org/fellowships", tags: ["painting", "drawing", "sculpture", "photography", "printmaking"] },
  { source: "efa_studio", title: "Elizabeth Foundation for the Arts Studio Program", type: "residency", deadline: "2026-08-05", location: "New York City", is_remote: false, link: "https://efanyc.org/studio-program/", tags: ["painting", "sculpture", "drawing", "installation", "emerging"] },
  { source: "pioneer_works", title: "Pioneer Works Residency", type: "residency", deadline: "2026-09-20", location: "Brooklyn, New York", is_remote: false, link: "https://pioneerworks.org/residency", tags: ["digital", "installation", "performance", "technology", "conceptual"] },
  { source: "hambidge", title: "Hambidge Center Artist Residency", type: "residency", deadline: "2026-07-25", location: "Rabun Gap, Georgia", is_remote: false, link: "https://www.hambidge.org/residency", tags: ["painting", "drawing", "sculpture", "photography", "ceramics"] },
  { source: "nevada_county_arts", title: "Nevada County Arts & Culture: Art in Public Spaces Open Call", type: "exhibition", deadline: "2026-08-06", location: "Nevada City, California", is_remote: false, link: "https://www.nevadacountyarts.org/call-to-artists/open-call-art-in-public-spaces", tags: ["painting", "drawing", "photography", "sculpture", "mixed media"] },
];

// Loose date patterns commonly seen on org apply pages, e.g.
// "Deadline: September 15, 2026", "Apply by 09/15/2026", "Applications due Sep 15 2026"
const DEADLINE_PATTERNS = [
  /(?:deadline|apply by|applications? due|due date|submissions? close)\D{0,15}([A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4})/i,
  /(?:deadline|apply by|applications? due|due date|submissions? close)\D{0,15}(\d{1,2}\/\d{1,2}\/\d{4})/i,
];

function findDeadlineOnPage(text) {
  for (const re of DEADLINE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

// Re-fetches one org's own apply page. Falls back to the seed deadline/requirements
// if the live scan can't confidently find something better — this means a closed
// or fee-changed cycle still gets caught by isValid() downstream, even if we can't
// find the *new* deadline yet.
async function scrapeSinglePage(fetch, config) {
  try {
    const html = await fetchHtml(fetch, config.link);
    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    const liveDeadline = findDeadlineOnPage(bodyText);
    const excerptStart = bodyText.toLowerCase().indexOf("fee");
    const feeExcerpt =
      excerptStart > -1
        ? bodyText.slice(Math.max(0, excerptStart - 60), excerptStart + 60)
        : "";

    const opp = {
      source: config.source,
      title: config.title,
      type: config.type,
      deadline: liveDeadline || config.deadline,
      location: config.location,
      is_remote: config.is_remote,
      link: config.link,
      tags: config.tags,
      requirements: feeExcerpt
        ? `Re-checked ${new Date().toISOString().slice(0, 10)}. Page mentions: "...${feeExcerpt.trim()}..."`
        : `Re-checked ${new Date().toISOString().slice(0, 10)}. No fee language detected on page.`,
      has_fee: false,
    };

    return isValid(opp) && looksFeeFree(opp) ? [opp] : [];
  } catch (err) {
    console.warn(`  [${config.source}] page check failed:`, err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2) Listing/aggregator sources — generic config-driven scraper.
//    Selectors below are best-effort placeholders based on typical listing-page
//    structure and are marked "VERIFY" — confirm against live devtools before
//    relying on them. Any scraper here fails soft (returns []) on selector
//    mismatch so one broken source can't take down the whole run.
// ---------------------------------------------------------------------------

async function scrapeListingSource(fetch, cfg) {
  try {
    const html = await fetchHtml(fetch, cfg.url);
    const $ = cheerio.load(html);
    const out = [];

    $(cfg.itemSelector).each((_, el) => {
      const $el = $(el);
      const title = $el.find(cfg.titleSelector).first().text().trim();
      let link = $el.find(cfg.linkSelector).first().attr("href") || "";
      if (link && !link.startsWith("http")) {
        link = new URL(link, cfg.url).toString();
      }
      const rawText = $el.text().replace(/\s+/g, " ").trim();

      if (!title || !link) return;

      out.push({
        source: cfg.source,
        title,
        type: cfg.type || "open-call",
        deadline: findDeadlineOnPage(rawText),
        location: cfg.location || "Various",
        is_remote: cfg.is_remote !== undefined ? cfg.is_remote : true,
        link,
        tags: cfg.tags || [],
        requirements: rawText.slice(0, 220),
        has_fee: false,
      });
    });

    const valid = out.filter((o) => isValid(o));
    return valid;
  } catch (err) {
    console.warn(`  [${cfg.source}] listing scrape failed:`, err.message);
    return [];
  }
}

function scrapeCaFE(fetch) {
  return scrapeListingSource(fetch, {
    source: "cafe",
    url: "https://artist.callforentry.org/festivals_unique_html.php",
    itemSelector: ".call-listing-item", // VERIFY against live HTML
    titleSelector: ".call-title",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

function scrapeSubmittable(fetch) {
  return scrapeListingSource(fetch, {
    source: "submittable",
    url: "https://www.submittable.com/discover/?category=visual-art",
    itemSelector: "[data-testid='discover-card']", // VERIFY
    titleSelector: "h3",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

function scrapeNYFASource(fetch) {
  return scrapeListingSource(fetch, {
    source: "nyfa_source",
    url: "https://www.nyfa.org/source/",
    itemSelector: ".source-listing-item", // VERIFY
    titleSelector: ".entry-title",
    linkSelector: "a",
    location: "New York",
    is_remote: false,
    tags: ["grant", "residency"],
  });
}

function scrapeResArtis(fetch) {
  return scrapeListingSource(fetch, {
    source: "res_artis",
    url: "https://resartis.org/opencalls/",
    itemSelector: ".opencall-item", // VERIFY
    titleSelector: ".opencall-title",
    linkSelector: "a",
    tags: ["residency"],
  });
}

function scrapeAAC(fetch) {
  // Art & About / "AAC" — placeholder source, adjust URL to whichever AAC listing you meant.
  return scrapeListingSource(fetch, {
    source: "aac",
    url: "https://www.artdeadline.com/", // VERIFY correct source URL
    itemSelector: "article", // VERIFY
    titleSelector: "h2",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

function scrapeEFlux(fetch) {
  return scrapeListingSource(fetch, {
    source: "eflux",
    url: "https://www.e-flux.com/search?c%5B%5D=Call+for+applications",
    itemSelector: ".search-result-item, .listing-item", // VERIFY
    titleSelector: "h3, .title",
    linkSelector: "a",
    location: "International",
    tags: ["open-call", "grant", "residency"],
  });
}

function scrapeArtconnect(fetch) {
  return scrapeListingSource(fetch, {
    source: "artconnect",
    url: "https://www.artconnect.com/opportunities",
    itemSelector: ".opportunity-card", // VERIFY
    titleSelector: ".opportunity-title",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

function scrapeTransArtists(fetch) {
  return scrapeListingSource(fetch, {
    source: "trans_artists",
    url: "https://www.transartists.org/en/opportunities",
    itemSelector: ".opportunity-teaser", // VERIFY
    titleSelector: ".teaser-title",
    linkSelector: "a",
    tags: ["residency"],
  });
}

function scrapeGrantsArt(fetch) {
  return scrapeListingSource(fetch, {
    source: "grants_for_artists", // point this at whichever grants aggregator you meant by "GrantsArt"
    url: "https://example-grants-aggregator.example/open", // TODO: set real URL
    itemSelector: ".grant-listing",
    titleSelector: ".grant-title",
    linkSelector: "a",
    tags: ["grant"],
  });
}

module.exports = {
  SINGLE_PROGRAM_PAGES,
  scrapeSinglePage,
  scrapeListingSource,
  scrapeCaFE,
  scrapeSubmittable,
  scrapeNYFASource,
  scrapeResArtis,
  scrapeAAC,
  scrapeEFlux,
  scrapeArtconnect,
  scrapeTransArtists,
  scrapeGrantsArt,
};
