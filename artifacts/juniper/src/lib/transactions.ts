// Client for GET /api/transactions, the member's full history over any range.
//
// This is a separate module from lib/finances.ts on purpose. That one is a
// context provider holding ONE dashboard payload for the whole app, merged over
// the member's manual figures. This is a per-view fetch with parameters, paging,
// and its own loading state, and folding it into the provider would mean every
// page re-rendering whenever the transactions tab changed a filter.
//
// Colors come from lib/finances.ts, so a group is the same color here as it is
// in the Overview donut.
import { getAccessToken } from "@/lib/supabase";
import { LOGO_KEY } from "@/lib/mock-data";

export interface TxnRow {
  id: string;
  m: string;                 // display label (merchant, else the raw name)
  merchant: string | null;   // Plaid's unmodified merchant string
  logo: string | null;       // Plaid's merchant art, or the merchant cache, else null
  c: string;                 // leaf category
  g: string;                 // group it rolls into
  k: "spend" | "income" | "transfer";
  v: number;                 // UI sign: negative is spending, positive is money in
  d: string;                 // ISO date
  pending: boolean;
  currency: string;
  account: string | null;
  mask: string | null;
  institution: string | null;
  // True when the member set this category themselves. The row marks it, so a
  // corrected category is distinguishable from one Plaid guessed.
  userSet?: boolean;
}

// The category picker's options, shipped with the first page rather than kept
// as a second copy of ~50 leaf labels in the client. api/_categorize.ts stays
// the source of truth.
export interface CategoryGroupOption { g: string; kind: "spend" | "income" | "transfer"; cats: string[] }
export interface BreakdownRow {
  c: string; v: number; n: number; pct: number;
  categories: { c: string; v: number; n: number }[];
}
export interface TxnSummary {
  count: number; spendCount: number; spent: number; income: number; net: number;
  transfers: number; average: number; perMonth: number; days: number;
  largest: { m: string; c: string; g: string; v: number; d: string } | null;
}
export interface TxnPage {
  range: { from: string | null; to: string | null };
  transactions: TxnRow[];
  nextCursor: string | null;
  hasMore: boolean;
  // First page only. The server walks the whole range to build these, so it
  // sends them once and the view holds them while it pages.
  available?: { from: string | null; to: string | null };
  breakdown?: BreakdownRow[];
  incomeBreakdown?: { c: string; v: number; n: number }[];
  trend?: { ym: string; spent: number; income: number }[];
  summary?: TxnSummary;
  truncated?: boolean;
  taxonomy?: CategoryGroupOption[];
}

export interface TxnQuery { from?: string | null; to?: string | null; cursor?: string | null; limit?: number }

export async function fetchTransactions(q: TxnQuery = {}): Promise<TxnPage | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const p = new URLSearchParams();
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    if (q.cursor) p.set("cursor", q.cursor);
    if (q.limit) p.set("limit", String(q.limit));
    const res = await fetch(`/api/transactions?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as TxnPage;
  } catch {
    return null;
  }
}

// ── Range presets ───────────────────────────────────────────────────────────
// "All" deliberately sends no `from`, rather than a computed one: the server
// knows how far back the member's history goes and the client does not, and
// guessing a start date is how a range control ends up quietly hiding rows.
export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "All";
export const RANGES: RangeKey[] = ["1M", "3M", "6M", "1Y", "All"];
const MONTHS_BACK: Record<Exclude<RangeKey, "All">, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function rangeFrom(key: RangeKey, today = new Date()): string | null {
  if (key === "All") return null;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - MONTHS_BACK[key]);
  return iso(d);
}

// True when the member's history is shorter than the preset asks for, so the
// view can say "all 4 months" instead of implying a full year was measured.
export function rangeIsClipped(key: RangeKey, availableFrom: string | null | undefined): boolean {
  const preset = rangeFrom(key);
  return !!preset && !!availableFrom && preset < availableFrom;
}

// ── Merchant art ────────────────────────────────────────────────────────────
//
// The source is the bundled merchant art already in lib/mock-logos.ts, reached
// through the same BrandTile that renders it everywhere else, with a colored
// monogram as the fallback. That is the whole decision, and it is worth stating
// why the two alternatives were not taken.
//
// `resolveInstitutionMark` in lib/institution-brand.ts is not it: that resolves
// INSTITUTIONS (the bank you linked), keyed by Plaid institution_id. A merchant
// is a different namespace and the two must not be crossed.
//
// Plaid's enrichment `logo_url` is not it either, at least not yet: the field is
// not in our `transactions` table, so using it means a migration plus a change
// to the sync writer plus a per-merchant image fetch from the client. That is a
// real option later, and this helper is the seam it would slot into. Bundled art
// ships today with no network round trip and no new column.
//
// Matching is on word boundaries, not substrings: "Ally" must not light up on
// "Rally's", and a merchant string from Plaid is usually the brand plus noise
// ("NETFLIX.COM", "WHOLEFDS MKT 103"), so an exact-equality test would miss
// almost everything.
const LOGO_NAMES = Object.keys(LOGO_KEY).sort((a, b) => b.length - a.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function merchantMark(raw: string | null, display: string): string {
  const hay = `${raw ?? ""} ${display}`;
  for (const name of LOGO_NAMES) {
    // Longest name first, so "Chase Sapphire Preferred" wins over "Chase".
    if (new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(hay)) return name;
  }
  return display;
}

export const initial = (s: string) => (s.trim()[0] || "?").toUpperCase();

// PATCH one transaction's category. Returns the stored row's new labels, so the
// table renders what the server saved rather than what the click assumed, or
// null on any failure, which the caller surfaces rather than swallowing.
export async function setTransactionCategory(
  id: string,
  category: string,
): Promise<{ id: string; c: string; g: string; k: TxnRow["k"] } | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, category }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; c: string; g: string; k: TxnRow["k"] };
  } catch {
    return null;
  }
}
