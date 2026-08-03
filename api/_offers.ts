// Marketplace offer ranking (Stage 5).
//
// PRINCIPLE: offers are ranked by estimated benefit to the USER — never by what
// the offer pays Juniper. That ordering is the product promise on the
// Recommended surface ("Ranking reflects fit to your finances, never payment"),
// so it lives in one pure, testable place both the API and any tests share.

export interface Offer {
  id: string;
  name: string;
  category: string;
  domain?: string | null;
  blurb?: string | null;
  description?: string | null;
  fit?: string | null;
  tags: string[];
  url: string;
  logo_url?: string | null;
  source: "curated" | "scraped" | "self-listed";
  est_benefit?: number | null; // estimated $/yr to the user, if known
  sort_order?: number;
}

// Higher estimated user benefit first. Ties broken by curator trust (curated >
// scraped > self-listed), then an explicit sort_order, then name — all
// user/quality signals, never payout. Offers with no benefit estimate sort
// after those that have one, preserving their relative sort_order/name.
const SOURCE_RANK: Record<Offer["source"], number> = { curated: 0, scraped: 1, "self-listed": 2 };

export function rankByBenefit(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const ab = typeof a.est_benefit === "number" ? a.est_benefit : -1;
    const bb = typeof b.est_benefit === "number" ? b.est_benefit : -1;
    if (ab !== bb) return bb - ab; // more user benefit first
    const as = SOURCE_RANK[a.source] ?? 9;
    const bs = SOURCE_RANK[b.source] ?? 9;
    if (as !== bs) return as - bs;
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}
