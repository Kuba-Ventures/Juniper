// Marketplace client helpers (Stage 5). The self-listing submission is the
// supply side; usePartners() is the demand side — it reads the DB-backed
// catalog (GET /api/partners) so offers change without a deploy, falling back
// to the seeded `listings` until the table is populated.
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";
import { listings, type SeriesKey } from "@/lib/mock-data";

// The shape a marketplace card renders (a superset-compatible view of both the
// live partner rows and the seeded `listings`).
export interface MarketplaceOffer {
  n: string;        // name
  cat: string;      // category
  logo: string;     // monogram fallback (BrandTile keys the real logo off `n`)
  k: SeriesKey;     // tile color
  stat: string;     // short headline stat
  blurb: string;
  tags: string[];
  src: "curated" | "self";
  url?: string;
}

// Raw row from GET /api/partners (already benefit-ranked server-side).
interface RawPartner {
  name: string; category: string; headline?: string | null; blurb?: string | null;
  tags?: string[] | null; url?: string | null; source?: string | null;
}

const CYCLE: SeriesKey[] = ["--jnpr-c1", "--jnpr-c2", "--jnpr-c3", "--jnpr-c4", "--jnpr-c5", "--jnpr-c6"];

function toOffer(p: RawPartner, i: number): MarketplaceOffer {
  return {
    n: p.name,
    cat: p.category,
    logo: p.name.charAt(0),
    k: CYCLE[i % CYCLE.length],
    stat: p.headline || "",
    blurb: p.blurb || "",
    tags: p.tags ?? [],
    src: p.source === "self-listed" ? "self" : "curated",
    url: p.url || undefined,
  };
}

// The seeded catalog, mapped to the card shape — the mock/offline fallback.
const SEED: MarketplaceOffer[] = listings.map((m) => ({
  n: m.n, cat: m.cat, logo: m.logo, k: m.k, stat: m.stat, blurb: m.blurb, tags: m.tags, src: m.src,
}));

async function fetchPartners(): Promise<MarketplaceOffer[] | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch("/api/partners", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { partners?: RawPartner[] };
    const rows = data?.partners ?? [];
    if (!rows.length) return null; // empty catalog -> keep the seed
    return rows.map(toOffer);
  } catch {
    return null;
  }
}

// A personalized "Picked for you" card — a marketplace offer plus the reason it
// was matched to this member.
export interface PickOffer extends MarketplaceOffer { match: string }

interface RawPick {
  name: string; category: string; headline?: string | null; blurb?: string | null;
  tags?: string[] | null; url?: string | null; source?: string | null; reason: string;
}

function pickToOffer(p: RawPick, i: number): PickOffer {
  return { ...toOffer(p, i), match: p.reason };
}

// The mock "picked" fallback — the seeded listings that carry a match reason.
const SEED_PICKS: PickOffer[] = listings
  .filter((m) => m.match)
  .map((m) => ({ n: m.n, cat: m.cat, logo: m.logo, k: m.k, stat: m.stat, blurb: m.blurb, tags: m.tags, src: m.src, match: m.match! }));

async function fetchPicks(): Promise<PickOffer[] | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch("/api/recommendations", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { linked?: boolean; picks?: RawPick[] };
    if (!data?.linked) return null;      // not synced -> keep demo picks
    return (data.picks ?? []).map(pickToOffer);
  } catch {
    return null;
  }
}

// Starts on the demo picks; swaps to personalized picks once the member is
// linked + synced. An empty live result (no gaps to address) is respected —
// that's a real "you're all set" state, distinct from the mock fallback.
export function usePicks(): { picks: PickOffer[]; source: "mock" | "live"; loading: boolean } {
  const [picks, setPicks] = useState<PickOffer[]>(SEED_PICKS);
  const [source, setSource] = useState<"mock" | "live">("mock");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchPicks()
      .then((live) => { if (alive && live) { setPicks(live); setSource("live"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { picks, source, loading };
}

// Starts on the seeded catalog so the page renders instantly, then swaps to the
// live DB catalog once it loads (kept on the seed if empty/unconfigured).
export function usePartners(): { offers: MarketplaceOffer[]; source: "seed" | "live"; loading: boolean } {
  const [offers, setOffers] = useState<MarketplaceOffer[]>(SEED);
  const [source, setSource] = useState<"seed" | "live">("seed");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchPartners()
      .then((live) => { if (alive && live) { setOffers(live); setSource("live"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { offers, source, loading };
}

export interface ListingSubmission {
  name: string;
  category: string;
  url: string;
  contactEmail: string;
  description?: string;
}

export type SubmitResult =
  | { ok: true; status: "pending" }
  | { ok: false; error: string };

// POST the self-listing to /api/partners/submit. Returns a friendly error when
// the user isn't signed in or the backend isn't configured yet.
export async function submitListing(payload: ListingSubmission): Promise<SubmitResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "Please sign in to list your service." };
    const res = await fetch("/api/partners/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 503) return { ok: false, error: "Listings aren't open yet — check back soon." };
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Couldn't submit your listing. Please try again." };
    return { ok: true, status: "pending" };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Please try again." };
  }
}
