// Which card holder the member's cards are drawn in on the Credit page.
//
// ── WHY THIS IS A MEMBER PREFERENCE AND NOT A DEVICE ONE ────────────────────
//
// Dark mode lives in localStorage (`juniper_theme`) and that is right for it: a
// theme is a property of the SCREEN, so wanting dark on a phone at night and
// light on a desktop at noon is coherent. A card holder is not that. It is a
// thing the member picked because they liked it, the same way somebody picks a
// wallet, and a wallet that changed when you opened your laptop would be a bug.
// So it is a column on `user_profiles` (migration 0048) and it travels.
//
// ── WHY THE OPTIONS ARE MATERIALS ───────────────────────────────────────────
//
// Organised by what the holder is made of, which is how somebody would describe
// the one they want and how anybody selling wallets arranges them. Deliberately
// NOT organised by who the member is: a gendered split would make somebody sort
// themselves into a bucket before they could find a look they like, the bucket
// does not predict the answer, and the same range is reachable either way.

/** The closed set. Mirrored by 0048's CHECK, because this value becomes part of
    a CSS class name and free text there is a selector nobody wrote. */
export const HOLDER_STYLES = ["cognac", "black", "saffiano", "canvas", "metal", "minimal"] as const;
export type HolderStyle = (typeof HOLDER_STYLES)[number];

/**
 * What an unchosen member sees.
 *
 * NULL in the database means "has not chosen", which is NOT the same as choosing
 * this value explicitly. A member who picks `minimal` on purpose keeps it if the
 * default ever moves; a member who never chose moves with it.
 */
export const DEFAULT_HOLDER: HolderStyle = "black";

/** Labels, as a person would say them out loud rather than as slugs. */
export const HOLDER_LABEL: Record<HolderStyle, string> = {
  cognac: "Cognac leather",
  black: "Black leather",
  saffiano: "Saffiano",
  canvas: "Canvas",
  metal: "Brushed metal",
  minimal: "Minimal",
};

/**
 * The CSS class for a style, and the ONLY place a stored value is turned into
 * one.
 *
 * Anything unrecognized falls back to the default rather than being interpolated
 * through. 0048's CHECK already refuses an unknown value, but a class name built
 * from stored data should not depend on a constraint in a database the client
 * cannot see: a row written before the CHECK existed, or by anything other than
 * this app, must not reach the DOM as a selector.
 */
export function holderClass(style: string | null | undefined): string {
  const known = (HOLDER_STYLES as readonly string[]).includes(style ?? "");
  return `hold-${known ? style : DEFAULT_HOLDER}`;
}

/** Narrow a stored value to a known style, or null for "has not chosen". */
export function asHolderStyle(v: unknown): HolderStyle | null {
  return typeof v === "string" && (HOLDER_STYLES as readonly string[]).includes(v)
    ? (v as HolderStyle)
    : null;
}
