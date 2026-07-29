// lib/validate.js — shared validation rules for SUBM1T opportunities.
//
// EVERYTHING that ever gets inserted into the `opportunities` table must pass through
// isValid() first, regardless of which pipeline produced it (the static seed list, a
// structured-source scrape, a re-checked single program page, or an AI web-search
// discovery). Previously this logic only lived inside scraper.js v2, so index.js's
// pipeline could insert fee-based or homepage-only links. Not anymore — both files
// now require this module.

function looksFeeFree(opp) {
  if (opp.has_fee) return false;
  if (opp.has_selection_fee) return false;

  const text = `${opp.requirements || ""} ${opp.title || ""}`.toLowerCase();
  const mentionsAnyFee = /\$\s?\d|fee\b/.test(text);
  const explicitlyNoFee = /no\s+(application\s+|entry\s+|submission\s+|jury\s+|selection\s+|processing\s+)?fee/.test(
    text
  );

  // A fee is mentioned (e.g. "$25 selection fee") without it being explicitly waived — reject.
  if (mentionsAnyFee && !explicitlyNoFee) return false;

  return true;
}

// Reject bare-domain links (e.g. "https://example.org" or "https://example.org/") —
// those send the artist to a homepage or search page instead of the specific call.
function isDeepLink(link) {
  try {
    const u = new URL(link);
    const path = u.pathname.replace(/\/+$/, ""); // strip trailing slash
    return path.length > 1; // must have more than just "/"
  } catch (e) {
    return false;
  }
}

function isFutureDate(dateStr) {
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d >= new Date();
}

function isValid(opp) {
  if (!opp || !opp.title || opp.title.length < 10) return false;
  if (!opp.link || !opp.link.startsWith("http")) return false;
  if (!isDeepLink(opp.link)) return false;
  if (!looksFeeFree(opp)) return false;
  if (opp.deadline && !isFutureDate(opp.deadline)) return false;
  return true;
}

module.exports = { isValid, looksFeeFree, isDeepLink, isFutureDate };
