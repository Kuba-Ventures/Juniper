import { LOGO_KEY } from "@/lib/mock-data";

// Formatting for transaction-level figures. Pure, so a chart can import it
// without pulling in the data layer.
//
// The money helpers differ from `money()` in lib/mock-data.ts on purpose.
// That one rounds to whole dollars because it prints TOTALS, where a cent is
// noise. These print ROWS the member is reconciling against their own bank
// statement, and a $11.99 charge rendered as $12 is what makes someone stop
// trusting the list.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDay = (isoDate: string) => {
  const [, m, d] = isoDate.split("-");
  return `${MONTH_ABBR[+m - 1]} ${+d}`;
};
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTH_ABBR[+m - 1]} ${y.slice(2)}`;
};
// The year is dropped from the common case (both ends in the same year) and
// kept only where it disambiguates, which is why a range starting last year
// ("1Y") reads "Sep 16, 2025 – Sep 15, 2026" instead of the reversed-looking
// "Sep 16 – Sep 15".
export const fmtRangeSpan = (fromIso: string, toIso: string) => {
  const fy = fromIso.slice(0, 4), ty = toIso.slice(0, 4);
  const from = fy === ty ? fmtDay(fromIso) : `${fmtDay(fromIso)}, ${fy}`;
  return `${from} – ${fmtDay(toIso)}, ${ty}`;
};
export const money2 = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

// ── Merchant art ────────────────────────────────────────────────────────────
//
// This is the LAST-RESORT tier: the bundled merchant art in lib/mock-logos.ts,
// reached through the same BrandTile that renders it everywhere else, with a
// colored monogram as the final fallback. `MerchantMark` (components/juniper/
// merchant-mark.tsx) tries Plaid's own `logo_url` first, then the favicon-based
// lookup in lib/merchant-domains.ts, and only falls here if both come back
// empty or fail to load.
//
// `resolveInstitutionMark` in lib/institution-brand.ts is not it: that resolves
// INSTITUTIONS (the bank you linked), keyed by Plaid institution_id. A merchant
// is a different namespace and the two must not be crossed.
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
