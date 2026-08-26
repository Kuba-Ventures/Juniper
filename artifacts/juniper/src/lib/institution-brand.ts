// How an institution gets a visual mark, in one place. Any surface that displays
// an institution (the Connections list, and the search rows in the connect flow)
// should call resolveInstitutionMark rather than rebuilding the fallback chain,
// because the chain is the whole point: Plaid has a
// real logo for most big banks, no logo at all for plenty of small ones, and a
// brand color for some institutions it has no artwork for.
//
// Deliberately its own module rather than living in lib/plaid.ts. LOGOS is roughly
// 170KB of base64 data URIs, and plaid.ts is imported by pages that never render
// an institution mark, so folding this in there would drag that payload into every
// one of those chunks. plaid.ts stays the transport and payload-shape layer; this
// is the presentation decision on top of it.
import { LOGOS } from "@/lib/mock-logos";
import { LOGO_KEY } from "@/lib/mock-data";
import { institutionLogoSrc, type InstitutionBrand } from "@/lib/plaid";

// Display names whose bundled art is filed under a key the slug pass below cannot
// reach ("American Express" slugifies to americanexpress, the asset is amex).
// Kept short on purpose: Plaid's own logo is the primary source now, so this only
// has to cover the handful of household names we bundle art for and Plaid might
// not have a mark for. Keys are lowercased and trimmed.
const BRAND_ALIASES: Record<string, string> = {
  "american express": "amex",
  "apple card": "apple",
  "charles schwab": "schwab",
  citibank: "citi",
  "citibank online": "citi",
  "discover bank": "discover",
  "marcus by goldman sachs": "marcus",
};

// The bundled brand mark for an institution, from its display name alone, which
// is all we have for a hand-added account and all Plaid gives us for a bank it
// holds no artwork for. Three passes, widest last: the alias table above, the
// merchant table the dashboard tiles read, then the name slugified into a key,
// which is how most of LOGOS is spelled anyway ("Wells Fargo" -> wellsfargo).
// Returns null rather than a placeholder so the caller owns its own fallback.
export function localBrandLogo(name: string): string | null {
  const trimmed = name.trim();
  const norm = trimmed.toLowerCase();
  const alias = BRAND_ALIASES[norm];
  if (alias && LOGOS[alias]) return LOGOS[alias];
  const merchantKey = LOGO_KEY[trimmed];
  if (merchantKey && LOGOS[merchantKey]) return LOGOS[merchantKey];
  return LOGOS[norm.replace(/[^a-z0-9]/g, "")] ?? null;
}

// Plaid's primary_color is whatever the bank's own brand is, which runs from
// near-white golds to near-black navies, and the tile it paints sits on a white
// surface in light mode and a near-black one in dark. So the letter is colored
// from the tint's measured brightness rather than assumed white (a white "T" on a
// pale gold tile is unreadable), and the tile keeps a hairline border in CSS so a
// very dark brand color does not dissolve into the dark-mode surface. Returns null
// for anything that isn't a plain 6-digit hex, the only shape Plaid sends.
export function brandTint(hex: string | null | undefined): { background: string; color: string } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Rec. 709 luma, the cheap standard proxy for perceived brightness.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { background: `#${m[1]}`, color: luma > 0.6 ? "#232B21" : "#FFFFFF" };
}

// What to draw for one institution. A union rather than a rendered element so the
// caller keeps its own markup and class names: the mark is 38px in the Connections
// list and smaller elsewhere, and each surface owns its own last-resort glyph.
export type InstitutionMark =
  | { kind: "logo"; src: string }
  | { kind: "monogram"; letter: string; background: string; color: string }
  | { kind: "glyph" };

// Resolve widest-first so a row is never a blank space: the real logo Plaid holds
// for the institution, then our bundled art, then a monogram tinted with the
// bank's own brand color, then "glyph", meaning the caller should fall back to its
// own default icon.
//
// `brand` is absent for a hand-added account, which carries an institution name
// and no Plaid id at all, so those resolve through the bundled art or drop
// straight to the glyph.
export function resolveInstitutionMark(
  name: string,
  brand?: InstitutionBrand | null,
): InstitutionMark {
  const src = institutionLogoSrc(brand?.logo) ?? localBrandLogo(name);
  if (src) return { kind: "logo", src };
  const tint = brandTint(brand?.primary_color);
  if (tint) {
    return { kind: "monogram", letter: name.trim().charAt(0).toUpperCase() || "?", ...tint };
  }
  return { kind: "glyph" };
}
