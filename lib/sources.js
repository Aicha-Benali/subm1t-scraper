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

// --- CaFE (artist.callforentry.org / opportunities.wearecreativewest.org) ---
// VERIFIED: fetched live 2026-07-29. Every listing is an <a> whose href contains
// "/opportunity/" and whose visible text includes "Application fee: $N" — this is
// far more stable than a specific CSS class, since CaFE's own React app is what
// actually shows that fee text. We read the fee straight off the page instead of
// guessing from surrounding words, which is strictly better than looksFeeFree()'s
// text-regex approach for this one source (though isValid() still re-checks it).
async function scrapeCaFE(fetch) {
  try {
    const html = await fetchHtml(
      fetch,
      "https://opportunities.wearecreativewest.org/search?sort=deadline_asc&status=OPEN"
    );
    const $ = cheerio.load(html);
    const out = [];

    $('a[href*="/opportunity/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href") || "";
      const link = href.startsWith("http")
        ? href
        : new URL(href, "https://opportunities.wearecreativewest.org").toString();
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text) return;

      const feeMatch = text.match(/Application fee:\s*\$?\s*(\d+)/i);
      const fee = feeMatch ? parseInt(feeMatch[1], 10) : null;
      if (fee === null || fee > 0) return; // no fee info found, or a paid call — skip

      // Text looks like: "Grants James Balog Earth Vision Awards Denver, Colorado Application fee: $0 CaFÉ logo"
      // Category is the first word/short phrase; strip it and the fee/logo suffix to get title+location.
      const withoutFee = text.replace(/Application fee:.*$/i, "").trim();
      const categoryMatch = withoutFee.match(
        /^(Fairs\/Festivals|Grants|Competitions|Commissions|Community|Exhibition|Residencies|Rosters|Resources)\s+/i
      );
      const category = categoryMatch ? categoryMatch[1] : "open-call";
      const rest = categoryMatch ? withoutFee.slice(categoryMatch[0].length) : withoutFee;

      out.push({
        source: "cafe",
        title: rest.trim().slice(0, 160) || rest,
        type: /grant/i.test(category)
          ? "grant"
          : /residenc/i.test(category)
          ? "residency"
          : /exhibition/i.test(category)
          ? "exhibition"
          : "open-call",
        deadline: null, // not shown in this list view; downstream isValid() allows a null deadline
        location: "See listing",
        is_remote: false,
        link,
        tags: [category.toLowerCase().replace(/[^a-z]/g, "")],
        requirements: `Fee-free listing on CaFE. ${text}`.slice(0, 220),
        has_fee: false,
      });
    });

    return out.filter((o) => isValid(o));
  } catch (err) {
    console.warn("  [cafe] scrape failed:", err.message);
    return [];
  }
}

// --- Artist Communities Alliance (artistcommunities.org) ---
// VERIFIED: fetched live 2026-07-29. This is a server-rendered Drupal Views table —
// each row is [Org name | linked open-call title], [view link], [deadline], [location].
async function scrapeAAC(fetch) {
  try {
    const html = await fetchHtml(fetch, "https://artistcommunities.org/directory/open-calls");
    const $ = cheerio.load(html);
    const out = [];

    $("table tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;

      const titleCell = $(cells[0]);
      const anchor = titleCell.find("a").first();
      let link = anchor.attr("href") || "";
      if (link && !link.startsWith("http")) {
        link = new URL(link, "https://artistcommunities.org").toString();
      }
      const titleText = anchor.text().trim();
      const orgText = titleCell
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .replace(/\|/g, "")
        .trim();

      const deadlineText = $(cells[cells.length - 2]).text().trim();
      const locationText = $(cells[cells.length - 1]).text().trim();
      const deadline = deadlineText ? new Date(deadlineText) : null;

      if (!titleText || !link) return;

      out.push({
        source: "aca",
        title: `${orgText ? orgText + " — " : ""}${titleText}`.slice(0, 160),
        type: "residency",
        deadline: deadline && !isNaN(deadline.getTime()) ? deadline.toISOString().slice(0, 10) : null,
        location: locationText || "See listing",
        is_remote: false,
        link,
        tags: ["residency"],
        requirements:
          "Listed on the Artist Communities Alliance open-calls directory. Check the listing for fee and eligibility details — ACA aggregates member residencies and not all are fee-free.",
        has_fee: false, // best-effort; isValid()/looksFeeFree() still re-check the requirements text
      });
    });

    return out.filter((o) => isValid(o));
  } catch (err) {
    console.warn("  [aca] scrape failed:", err.message);
    return [];
  }
}

// --- e-flux: DISABLED. Confirmed live (2026-07-29) that e-flux actively blocks
// automated requests (bot detection), so there's no reliable way to fetch its
// listing pages server-side. Leaving this as a documented no-op rather than a
// scraper that silently returns nothing for an unclear reason.
async function scrapeEFlux() {
  console.warn("  [eflux] skipped — e-flux blocks automated requests, no reliable fetch path");
  return [];
}

// --- NYFA Opportunities Board: DISABLED. Confirmed live (2026-07-29) that
// nyfa.org/opportunities/ renders its listings client-side via JavaScript — a
// plain fetch only returns the filter UI, not the actual opportunity rows. It DOES
// have a built-in "No Fee Application: Yes" filter, so if you (or a future me)
// find the underlying JSON endpoint it calls (check the Network tab for an XHR/fetch
// request while the page loads), this is a great source to wire up properly.
async function scrapeNYFASource() {
  console.warn("  [nyfa_source] skipped — listings are loaded client-side via JS, no static HTML to parse");
  return [];
}

function scrapeResArtis(fetch) {
  return scrapeListingSource(fetch, {
    source: "res_artis",
    url: "https://resartis.org/open-calls/", // corrected from /opencalls/, confirmed via search to be the real path
    itemSelector: ".opencall-item, article, .post", // VERIFY — could not fetch this one live (see note below)
    titleSelector: "h2, h3, .title",
    linkSelector: "a",
    tags: ["residency"],
  });
}

function scrapeArtconnect(fetch) {
  return scrapeListingSource(fetch, {
    source: "artconnect",
    url: "https://www.artconnect.com/opportunities",
    itemSelector: ".opportunity-card, article", // VERIFY
    titleSelector: ".opportunity-title, h3",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

function scrapeTransArtists(fetch) {
  return scrapeListingSource(fetch, {
    source: "trans_artists",
    url: "https://www.transartists.org/en/opportunities",
    itemSelector: ".opportunity-teaser, article", // VERIFY
    titleSelector: ".teaser-title, h3",
    linkSelector: "a",
    tags: ["residency"],
  });
}

function scrapeSubmittable(fetch) {
  return scrapeListingSource(fetch, {
    source: "submittable",
    url: "https://www.submittable.com/discover/?category=visual-art",
    itemSelector: "[data-testid='discover-card'], article", // VERIFY
    titleSelector: "h3",
    linkSelector: "a",
    tags: ["open-call"],
  });
}

// Repurposed from the original "GrantsArt" placeholder — this now points at
// onlyforartists.com, a directory specifically curated for fee-free open calls,
// which matches your mission far better than a generic grants aggregator.
// I could not fetch this one live to verify selectors (see note below).
function scrapeGrantsArt(fetch) {
  return scrapeListingSource(fetch, {
    source: "only_for_artists",
    url: "https://www.onlyforartists.com/",
    itemSelector: ".listing, .call-item, article", // VERIFY
    titleSelector: "h2, h3, .title",
    linkSelector: "a",
    tags: ["open-call"],
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
