// SUBM1T. — Scraper v2 (Node.js)
const { createClient } = require("@supabase/supabase-js");

let supabase;

function getOpportunities() {
  return [
    {
      title: "MacDowell Artist Residency",
      type: "residency",
      deadline: "2026-09-15",
      location: "New Hampshire, USA",
      is_remote: false,
      requirements: "All disciplines welcome. Financial assistance available. No application fee.",
      link: "https://www.macdowell.org/apply",
      tags: ["painting", "drawing", "sculpture", "photography"],
      has_fee: false,
    },
    {
      title: "Yaddo Artist Residency",
      type: "residency",
      deadline: "2026-10-01",
      location: "Saratoga Springs, New York",
      is_remote: false,
      requirements: "Professional artists with track record. No application fee.",
      link: "https://yaddo.org/apply/",
      tags: ["painting", "sculpture", "photography", "established"],
      has_fee: false,
    },
    {
      title: "Houston Arts Alliance Individual Artist Grant",
      type: "grant",
      deadline: "2026-07-15",
      location: "Houston, Texas",
      is_remote: false,
      requirements: "Houston residents only. All disciplines. 18+. No application fee.",
      link: "https://www.houstonartsalliance.com/grants/",
      tags: ["painting", "drawing", "sculpture", "photography", "digital", "houston"],
      has_fee: false,
    },
    {
      title: "NARS Foundation International Artist Residency",
      type: "residency",
      deadline: "2026-07-01",
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "International artists welcome. Studio space provided. No application fee.",
      link: "https://www.narsfoundation.org/residency-program",
      tags: ["painting", "sculpture", "installation", "drawing", "emerging"],
      has_fee: false,
    },
    {
      title: "Skowhegan School of Painting and Sculpture",
      type: "residency",
      deadline: "2026-06-20",
      location: "Skowhegan, Maine",
      is_remote: false,
      requirements: "Early career artists. Full scholarships available. No application fee.",
      link: "https://www.skowheganart.org/apply/",
      tags: ["painting", "sculpture", "drawing", "emerging", "student"],
      has_fee: false,
    },
    {
      title: "Creative Capital Visual Arts Grant",
      type: "grant",
      deadline: "2026-08-01",
      location: "USA (national)",
      is_remote: true,
      requirements: "US-based artists. 5+ years practice. Experimental work. No fee.",
      link: "https://creative-capital.org/apply/",
      tags: ["digital", "video", "performance", "installation", "mid-career"],
      has_fee: false,
    },
    {
      title: "Pollock-Krasner Foundation Grant",
      type: "grant",
      deadline: "2026-07-30",
      location: "International",
      is_remote: true,
      requirements: "Professional painters and sculptors. Merit and financial need. No application fee.",
      link: "https://www.pkf.org/apply/",
      tags: ["painting", "drawing", "printmaking", "sculpture", "established"],
      has_fee: false,
    },
    {
      title: "Headlands Center for the Arts Residency",
      type: "residency",
      deadline: "2026-09-01",
      location: "Marin Headlands, California",
      is_remote: false,
      requirements: "Emerging and mid-career artists. All disciplines. No application fee.",
      link: "https://headlands.org/program/artist-in-residence/",
      tags: ["painting", "drawing", "photography", "sculpture", "installation", "video"],
      has_fee: false,
    },
    {
      title: "Eyebeam Digital Arts Fellowship",
      type: "residency",
      deadline: "2026-07-10",
      location: "New York City",
      is_remote: false,
      requirements: "NYC-based artists working at intersection of art and technology. No fee.",
      link: "https://www.eyebeam.org/fellowships/",
      tags: ["digital", "video", "installation", "technology", "emerging"],
      has_fee: false,
    },
    {
      title: "New York Foundation for the Arts Fellowship",
      type: "grant",
      deadline: "2026-07-20",
      location: "New York State",
      is_remote: false,
      requirements: "NY state residents. 7+ years practice. Craft and object-based arts. No fee.",
      link: "https://www.nyfa.org/awards-grants/nyfa-artists-fellowships/",
      tags: ["painting", "drawing", "printmaking", "sculpture", "ceramics", "established"],
      has_fee: false,
    },
    {
      title: "Rauschenberg Foundation Artist as Activist Fellowship",
      type: "grant",
      deadline: "2026-08-15",
      location: "International",
      is_remote: true,
      requirements: "Artists using work as a tool for social change. All disciplines. No fee.",
      link: "https://rauschenbergfoundation.org/grants",
      tags: ["photography", "video", "installation", "performance", "political"],
      has_fee: false,
    },
    {
      title: "Smack Mellon Open Studio Program",
      type: "residency",
      deadline: "2026-06-30",
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "Brooklyn-based emerging artists. Underrepresented artists prioritized. No fee.",
      link: "https://www.smackmellon.org/studio-program/",
      tags: ["painting", "sculpture", "installation", "video", "performance", "emerging"],
      has_fee: false,
    },
    {
      title: "Print Arts Houston Annual Open Call",
      type: "open-call",
      deadline: "2026-07-05",
      location: "Houston, Texas",
      is_remote: false,
      requirements: "Open to all artists. Prints, drawings, and works on paper. No entry fee.",
      link: "https://printartshouston.org/",
      tags: ["printmaking", "drawing", "illustration", "houston"],
      has_fee: false,
    },
    {
      title: "Frieze Artist Award",
      type: "open-call",
      deadline: "2026-10-15",
      location: "International",
      is_remote: true,
      requirements: "Emerging and mid-career artists. Ambitious new work. No application fee.",
      link: "https://www.frieze.com/artist-award",
      tags: ["installation", "sculpture", "digital", "video", "performance", "emerging"],
      has_fee: false,
    },
    {
      title: "Bemis Center for Contemporary Arts Residency",
      type: "residency",
      deadline: "2026-08-20",
      location: "Omaha, Nebraska",
      is_remote: false,
      requirements: "Professional artists at all career stages. All disciplines. No application fee.",
      link: "https://www.bemiscenter.org/residencies/apply",
      tags: ["painting", "sculpture", "installation", "video", "photography"],
      has_fee: false,
    },
    {
      title: "Djerassi Resident Artists Program",
      type: "residency",
      deadline: "2026-09-10",
      location: "Woodside, California",
      is_remote: false,
      requirements: "Professional artists. All disciplines. Financial assistance available. No fee.",
      link: "https://www.djerassi.org/apply/",
      tags: ["painting", "drawing", "sculpture", "photography"],
      has_fee: false,
    },
    {
      title: "Vermont Studio Center Artist Fellowship",
      type: "residency",
      deadline: "2026-06-15",
      location: "Johnson, Vermont",
      is_remote: false,
      requirements: "All career stages. Full fellowships available. No application fee.",
      link: "https://www.vermontstudiocenter.org/fellowships",
      tags: ["painting", "drawing", "sculpture", "photography", "printmaking"],
      has_fee: false,
    },
    {
      title: "Elizabeth Foundation for the Arts Studio Program",
      type: "residency",
      deadline: "2026-08-05",
      location: "New York City",
      is_remote: false,
      requirements: "Emerging NYC-based artists. All disciplines. No application fee.",
      link: "https://efanyc.org/studio-program/",
      tags: ["painting", "sculpture", "drawing", "installation", "emerging"],
      has_fee: false,
    },
    {
      title: "Pioneer Works Residency",
      type: "residency",
      deadline: "2026-09-20",
      location: "Brooklyn, New York",
      is_remote: false,
      requirements: "Artists and scientists working across disciplines. No fee.",
      link: "https://pioneerworks.org/residency",
      tags: ["digital", "installation", "performance", "technology", "conceptual"],
      has_fee: false,
    },
    {
      title: "Hambidge Center Artist Residency",
      type: "residency",
      deadline: "2026-07-25",
      location: "Rabun Gap, Georgia",
      is_remote: false,
      requirements: "Professional artists at all stages. Need-based fellowships available. No fee.",
      link: "https://www.hambidge.org/residency",
      tags: ["painting", "drawing", "sculpture", "photography", "ceramics"],
      has_fee: false,
    },
  ];
}

function isValid(opp) {
  if (!opp.title || opp.title.length < 10) return false;
  if (!opp.link || !opp.link.startsWith("http")) return false;
  if (opp.has_fee) return false;
  if (opp.deadline) {
    const d = new Date(opp.deadline);
    if (isNaN(d.getTime()) || d < new Date()) return false;
  }
  return true;
}

async function filterNew(opps) {
  const { data: existing, error } = await supabase
    .from("opportunities")
    .select("title")
    .limit(1000);

  if (error) {
    console.error("Could not fetch existing titles:", error.message);
    return opps;
  }

  const existingTitles = new Set(
    (existing || []).map((r) => r.title.toLowerCase().trim())
  );

  return opps.filter(
    (o) => !existingTitles.has(o.title.toLowerCase().trim())
  );
}

async function pruneExpired() {
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
  return (data || []).length;
}

async function main() {
  console.log("SUBM1T scraper v2 starting...");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const pruned = await pruneExpired();
  console.log("Pruned expired:", pruned);

  const all = getOpportunities();
  const valid = all.filter(isValid);
  console.log("Valid in pool:", valid.length);

  const fresh = await filterNew(valid);
  console.log("New to insert:", fresh.length);

  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert(fresh)
      .select("id");

    if (error) {
      console.error("Insert error:", error.message);
      process.exit(1);
    }

    console.log("Inserted:", (data || []).length);
  } else {
    console.log("Nothing new to insert.");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
