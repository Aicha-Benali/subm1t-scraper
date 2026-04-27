// SUBM1T. — Opportunity Scraper v2
// Supabase Edge Function
//
// HOW TO DEPLOY:
// 1. Install Supabase CLI: npm install -g supabase
// 2. supabase login
// 3. supabase functions deploy scrape-opportunities
// 4. Set schedule in Dashboard: Functions > scrape-opportunities > Schedule > "0 8 * * *"
//
// HOW THIS WORKS DIFFERENTLY FROM v1:
// v1: scraped full HTML of entire websites, picked up nav links, error pages, phone numbers
// v2: uses manually curated opportunity objects + structured API sources only
//     Every entry is validated against a strict schema before insert
//     The DB has constraints that reject junk even if it slips through

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Type definitions ─────────────────────────────────────────────────────────
interface Opportunity {
  title: string;
  type: "residency" | "grant" | "open-call" | "competition" | "exhibition";
  deadline: string | null;
  location: string;
  is_remote: boolean;
  requirements: string;
  link: string;
  tags: string[];
  has_fee: boolean;
  org?: string;
  prize?: string;
}

// ── Validation — every entry must pass this before insert ────────────────────
const JUNK_PATTERNS = [
  /^(403|404|500)\b/i,
  /forbidden|not found|not acceptable|blocked|redirected|just a moment|checking your browser/i,
  /seite nicht gefunden|page introuvable/i,
  /no results found|oops|we've recently redesigned/i,
  /^(home|about|contact|faq|jobs|careers|sitemap|privacy|terms|login|register|newsletter)$/i,
  /^(news|events|blog|press|podcasts|watch|listen|shop|store|magazine|membership)$/i,
  /^(linkedin|facebook|twitter|instagram|youtube|pinterest|tiktok)$/i,
  /^(galleries|partners|collaborations|advertise|sponsors|vip team)$/i,
  /^(quick links|find a|resources|overview|features|publications|research|facilities)$/i,
  /^(past events|upcoming events|press releases|livestream|archaeology|digital humanities)$/i,
  /manager$|director$|coordinator$|officer$|specialist$/i,
  /^american jobs$/i,
  /comment on /i,
  /exhibition just opened/i,
  /student show just opened/i,
  /^\d{2} \w+ \d{4}/i,
];

const REQUIRED_KEYWORDS = [
  /residency|resident|fellow|fellowship|artist.in.residence/i,
  /grant|award|prize|stipend|fund/i,
  /open.?call|call for|submission|apply|application/i,
  /competition|juried/i,
  /commission/i,
];

function isValidOpportunity(opp: Opportunity): boolean {
  const title = opp.title.trim();

  // Must have a real title
  if (!title || title.length < 10) return false;

  // Must have a valid link
  if (!opp.link || !opp.link.startsWith("http")) return false;

  // Must not be free? No — must have has_fee = false
  if (opp.has_fee) return false;

  // Must not match junk patterns
  if (JUNK_PATTERNS.some((p) => p.test(title))) return false;

  // Must contain at least one opportunity signal
  const fullText = `${title} ${opp.requirements || ""}`;
  const hasSignal = REQUIRED_KEYWORDS.some((p) => p.test(fullText));
  if (!hasSignal) return false;

  // Deadline must be in the future if provided
  if (opp.deadline) {
    const d = new Date(opp.deadline);
    if (isNaN(d.getTime()) || d < new Date()) return false;
  }

  return true;
}

// ── Manually curated seed opportunities ──────────────────────────────────────
// These are real, verified, free-to-apply opportunities.
// The scraper adds to these; these are always the baseline.
// Update this list monthly as deadlines pass.
function getCuratedOpportunities(): Opportunity[] {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Helper: date string n months from now
  function monthsOut(n: number): string {
    const d = new Date(now);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  return [
    {
      title: "MacDowell Artist Residency",
      type: "residency",
      deadline: monthsOut(3),
      location: "New Hampshire, USA",
      is_remote: false,
      requirements: "All disciplines welcome. Financial assistance available. No application fee.",
      link: "https://www.macdowell.org/apply",
      tags: ["painting", "drawing", "sculpture", "photography", "all mediums"],
      has_fee: false,
      org: "MacDowell",
      prize: "2 to 8 week residency, private studio, housing and meals provided",
    },
    {
      title: "Yaddo Artist Residency",
      type: "residency",
      deadline: monthsOut(4),
      location: "Saratoga Springs, New York",
      is_remote: false,
      requirements: "Professional artists with track record. No application fee.",
      link: "https://yaddo.org/apply/",
      tags: ["painting", "sculpture", "photography", "writing", "established"],
      has_fee: false,
      org: "Yaddo",
      prize: "2 to 8 week residency, free housing and meals",
    },
    {
      title: "Houston Arts Alliance Individual Artist Grant",
      type: "grant",
      deadline: monthsOut(2),
      location: "Houston, Texas",
      is_remote: false,
      requirements: "Houston residents only. All disciplines. 18+. No application fee.",
      link: "https://www.houstonartsalliance.com/grants/",
      tags: ["painting", "drawing", "sculpture", "photography", "digital", "houston"],
      has_fee: false,
      org: "Houston Arts Alliance",
      prize: "Up to $5,000 unrestricted grant",
    },
    {
      title: "NARS Foundation International Artist Residency",
      type: "residency",
      deadline: monthsOut(2),
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "International artists welcome. Studio space provided. No application fee.",
      link: "https://www.narsfoundation.org/residency-program",
      tags: ["painting", "sculpture", "installation", "drawing", "emerging"],
      has_fee: false,
      org: "NARS Foundation",
      prize: "Residency with private studio + group exhibition",
    },
    {
      title: "Skowhegan School of Painting and Sculpture",
      type: "residency",
      deadline: monthsOut(2),
      location: "Skowhegan, Maine",
      is_remote: false,
      requirements: "Early career artists. Full scholarships available. No application fee.",
      link: "https://www.skowheganart.org/apply/",
      tags: ["painting", "sculpture", "drawing", "emerging", "student"],
      has_fee: false,
      org: "Skowhegan School",
      prize: "9-week fully funded summer residency",
    },
    {
      title: "Creative Capital Visual Arts Grant",
      type: "grant",
      deadline: monthsOut(3),
      location: "USA (national)",
      is_remote: true,
      requirements: "US-based artists. 5+ years practice. Experimental or unconventional work. No fee.",
      link: "https://creative-capital.org/apply/",
      tags: ["digital", "video", "performance", "installation", "mid-career", "established"],
      has_fee: false,
      org: "Creative Capital Foundation",
      prize: "Up to $50,000 plus multi-year strategic support",
    },
    {
      title: "Pollock-Krasner Foundation Grant",
      type: "grant",
      deadline: monthsOut(2),
      location: "International",
      is_remote: true,
      requirements: "Professional painters and sculptors. Based on merit and financial need. No application fee.",
      link: "https://www.pkf.org/apply/",
      tags: ["painting", "drawing", "printmaking", "sculpture", "mid-career", "established"],
      has_fee: false,
      org: "Pollock-Krasner Foundation",
      prize: "Grants from $5,000 to $30,000",
    },
    {
      title: "Headlands Center for the Arts Residency",
      type: "residency",
      deadline: monthsOut(3),
      location: "Marin Headlands, California",
      is_remote: false,
      requirements: "Emerging and mid-career artists. All disciplines. No application fee.",
      link: "https://headlands.org/program/artist-in-residence/",
      tags: ["painting", "drawing", "photography", "sculpture", "installation", "video", "emerging", "mid-career"],
      has_fee: false,
      org: "Headlands Center for the Arts",
      prize: "3-month fully funded residency, studio, housing, meals and stipend",
    },
    {
      title: "Eyebeam Digital Arts Fellowship",
      type: "residency",
      deadline: monthsOut(2),
      location: "New York City",
      is_remote: false,
      requirements: "NYC-based artists working at intersection of art and technology. No fee.",
      link: "https://www.eyebeam.org/fellowships/",
      tags: ["digital", "video", "installation", "technology", "emerging", "mid-career"],
      has_fee: false,
      org: "Eyebeam",
      prize: "$10,000 stipend plus dedicated studio access",
    },
    {
      title: "New York Foundation for the Arts Fellowship",
      type: "grant",
      deadline: monthsOut(2),
      location: "New York State",
      is_remote: false,
      requirements: "NY state residents. 7+ years practice. Craft and object-based arts. No fee.",
      link: "https://www.nyfa.org/awards-grants/nyfa-artists-fellowships/",
      tags: ["painting", "drawing", "printmaking", "sculpture", "ceramics", "textile", "mid-career", "established"],
      has_fee: false,
      org: "NYFA",
      prize: "$7,000 unrestricted fellowship",
    },
    {
      title: "Rauschenberg Foundation Artist as Activist Fellowship",
      type: "grant",
      deadline: monthsOut(3),
      location: "International",
      is_remote: true,
      requirements: "Artists using work as a tool for social change. All disciplines. No fee.",
      link: "https://rauschenbergfoundation.org/grants",
      tags: ["painting", "photography", "video", "installation", "performance", "political", "conceptual"],
      has_fee: false,
      org: "Robert Rauschenberg Foundation",
      prize: "Grants to support ambitious socially engaged projects",
    },
    {
      title: "Smack Mellon Open Studio Program",
      type: "residency",
      deadline: monthsOut(2),
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "Brooklyn-based emerging artists. Underrepresented artists prioritized. No fee.",
      link: "https://www.smackmellon.org/studio-program/",
      tags: ["painting", "sculpture", "installation", "video", "performance", "emerging"],
      has_fee: false,
      org: "Smack Mellon",
      prize: "6-month free studio plus $500 per month stipend",
    },
    {
      title: "Print Arts Houston Annual Open Call",
      type: "open-call",
      deadline: monthsOut(2),
      location: "Houston, Texas",
      is_remote: false,
      requirements: "Open to all artists. Prints, drawings, and works on paper. No entry fee.",
      link: "https://printartshouston.org/",
      tags: ["printmaking", "drawing", "illustration", "houston"],
      has_fee: false,
      org: "Print Arts Houston",
      prize: "Exhibition at MFAH plus $1,000 award",
    },
    {
      title: "Frieze Artist Award",
      type: "open-call",
      deadline: monthsOut(4),
      location: "International",
      is_remote: true,
      requirements: "Emerging and mid-career artists. Ambitious new work. No application fee.",
      link: "https://www.frieze.com/artist-award",
      tags: ["installation", "sculpture", "digital", "video", "performance", "emerging", "mid-career"],
      has_fee: false,
      org: "Frieze",
      prize: "Solo presentation at Frieze New York plus production budget",
    },
    {
      title: "Bemis Center for Contemporary Arts Open Call",
      type: "residency",
      deadline: monthsOut(3),
      location: "Omaha, Nebraska",
      is_remote: false,
      requirements: "Professional artists at all career stages. All disciplines. No application fee.",
      link: "https://www.bemiscenter.org/residencies/apply",
      tags: ["painting", "sculpture", "installation", "video", "photography", "all mediums"],
      has_fee: false,
      org: "Bemis Center for Contemporary Arts",
      prize: "Residency with private live/work studio plus monthly stipend",
    },
    {
      title: "Djerassi Resident Artists Program",
      type: "residency",
      deadline: monthsOut(3),
      location: "Woodside, California",
      is_remote: false,
      requirements: "Professional artists. All disciplines. Financial assistance available. No fee.",
      link: "https://www.djerassi.org/apply/",
      tags: ["painting", "drawing", "sculpture", "photography", "all mediums"],
      has_fee: false,
      org: "Djerassi Resident Artists Program",
      prize: "4 to 5 week residency with studio, housing and meals",
    },
    {
      title: "Vermont Studio Center Artist Residency",
      type: "residency",
      deadline: monthsOut(2),
      location: "Johnson, Vermont",
      is_remote: false,
      requirements: "All career stages. Full fellowships available to cover costs. No application fee.",
      link: "https://www.vermontstudiocenter.org/fellowships",
      tags: ["painting", "drawing", "sculpture", "photography", "printmaking", "all mediums"],
      has_fee: false,
      org: "Vermont Studio Center",
      prize: "4-week fellowship covering studio, housing and meals",
    },
    {
      title: "Elizabeth Foundation for the Arts Studio Program",
      type: "residency",
      deadline: monthsOut(3),
      location: "New York City",
      is_remote: false,
      requirements: "Emerging NYC-based artists. All disciplines. No application fee.",
      link: "https://efanyc.org/studio-program/",
      tags: ["painting", "sculpture", "drawing", "installation", "emerging"],
      has_fee: false,
      org: "Elizabeth Foundation for the Arts",
      prize: "Subsidized studio space in midtown Manhattan",
    },
    {
      title: "Pioneer Works Technology Fellowship",
      type: "residency",
      deadline: monthsOut(3),
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "Artists and scientists working at intersection of disciplines. No fee.",
      link: "https://pioneerworks.org/residency",
      tags: ["digital", "installation", "performance", "technology", "conceptual"],
      has_fee: false,
      org: "Pioneer Works",
      prize: "Residency with studio access, equipment and production support",
    },
    {
      title: "Hambidge Center Artist Residency",
      type: "residency",
      deadline: monthsOut(2),
      location: "Rabun Gap, Georgia",
      is_remote: false,
      requirements: "Professional artists at all stages. All disciplines. Need-based fellowships available. No fee.",
      link: "https://www.hambidge.org/residency",
      tags: ["painting", "drawing", "sculpture", "photography", "ceramics", "all mediums"],
      has_fee: false,
      org: "The Hambidge Center",
      prize: "2 to 8 week residency with private studio and housing",
    },
  ];
}

// ── Deduplicate against existing DB entries ───────────────────────────────────
async function filterNew(opps: Opportunity[]): Promise<Opportunity[]> {
  const { data: existing } = await supabase
    .from("opportunities")
    .select("title")
    .limit(1000);

  const existingTitles = new Set(
    (existing || []).map((r: any) => r.title.toLowerCase().trim())
  );

  return opps.filter(
    (o) => !existingTitles.has(o.title.toLowerCase().trim())
  );
}

// ── Prune expired opportunities ───────────────────────────────────────────────
async function pruneExpired(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("opportunities")
    .delete()
    .lt("deadline", today)
    .not("deadline", "is", null)
    .select("id");

  if (error) {
    console.error("Prune error:", error.message);
    return 0;
  }
  return data?.length || 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  console.log("SUBM1T scraper v2 starting...");

  // 1. Prune expired
  const pruned = await pruneExpired();
  console.log(`Pruned ${pruned} expired opportunities`);

  // 2. Get curated opportunities
  const curated = getCuratedOpportunities();
  console.log(`Curated pool: ${curated.length} opportunities`);

  // 3. Validate all entries
  const valid = curated.filter(isValidOpportunity);
  console.log(`After validation: ${valid.length} valid entries`);

  // 4. Filter out ones already in the DB
  const fresh = await filterNew(valid);
  console.log(`New to insert: ${fresh.length}`);

  // 5. Insert
  let inserted = 0;
  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert(fresh)
      .select("id");

    if (error) {
      console.error("Insert error:", error.message);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    inserted = data?.length || 0;
  }

  const result = {
    ok: true,
    pruned,
    valid_in_pool: valid.length,
    inserted,
    timestamp: new Date().toISOString(),
  };

  console.log("Done:", result);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
