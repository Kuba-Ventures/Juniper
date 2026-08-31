import { brandTint } from "@/lib/institution-brand";
import { readableDate } from "@/lib/cards";

// The small pieces every card-rewards section shares: the synthesized card face,
// the point-valuation caveat, and the provenance footer. Issue #168.
//
// One file rather than three, because all three exist for the same reason and
// have to stay consistent with each other: the face must never look like real
// issuer art, and the two notes must never be quietly dropped.
//
// EVERY CLASS HERE IS PREFIXED `cr-`. That is not a style preference, it is a
// bug fix. `juniper.css` already owns `.sw` (the share-sheet switch, which sets
// `width: 10px`) and `.hero`, and the design treatment set for this issue linked
// the shipped stylesheet and rendered as a column of single words until both were
// renamed. `.cf` was not a collision but already means "cashflow" everywhere else
// in that file. See design/card-rewards-variants.html.

// ── The card face ──────────────────────────────────────────────────────────
//
// JUNIPER DOES NOT SHIP ISSUER CARD ART, and this component is the reason the
// page does not need any. Real card images are trademarked and licensed: Credit
// Karma pays for the ones in the screenshots on #168, and copying them would put
// somebody else's licensed artwork in a product Juniper ships.
//
// So a face is drawn from two things Juniper legitimately has. The product's
// stored `brand_color`, which is a colour rather than a mark, and the
// institution's own logo as served by Plaid, which this app is already licensed
// for through its Plaid agreement and already renders on Connections and on the
// Credit card rows. The result reads as "your Chase card" without pretending to
// be a photograph of it.
//
// A card the member has not identified gets an OUTLINE, not a colour. There is no
// brand to borrow yet, and inventing one would make an unanswered card look
// answered.

export type CardFaceSize = "lg" | "md" | "sm";

export function CardFace({
  issuer,
  productName,
  mask,
  brandColor,
  logoSrc,
  size = "md",
  unknown = false,
  label,
}: {
  issuer?: string;
  productName?: string;
  mask?: string | null;
  brandColor?: string | null;
  /** The institution's own mark, resolved by the caller through the same chain
      Connections uses. Absent is fine and common: plenty of banks have no logo. */
  logoSrc?: string | null;
  size?: CardFaceSize;
  /** No product confirmed yet, so draw the outline rather than a colour. */
  unknown?: boolean;
  /** Overrides the product name, for the outline state ("Which card?"). */
  label?: string;
}) {
  const cls = `cr-face cr-face-${size}${unknown ? " cr-face-unk" : ""}`;
  // The face carries white text over the brand colour, and Plaid's brand colours
  // run from near-white golds to near-black navies. `brandTint` already measures
  // Rec. 709 luma for exactly this problem on the Connections monogram tiles, so
  // the ink is reused from there rather than assumed to be white: a white product
  // name on a pale gold card is unreadable.
  const tint = unknown ? null : brandTint(brandColor);
  const style = tint ? { background: tint.background, color: tint.color } : undefined;
  const name = label ?? productName ?? "";

  return (
    <span className={cls} style={style} aria-hidden="true">
      <span className="cr-face-in">
        <span>
          {size !== "sm" && issuer && !unknown && (
            logoSrc
              ? <img className="cr-face-logo" src={logoSrc} alt="" />
              : <span className="cr-face-iss">{issuer}</span>
          )}
          {size !== "sm" && name && <span className="cr-face-nm">{name}</span>}
        </span>
        {size !== "sm" && (
          <span className="cr-face-ft">
            <span className="cr-face-chip" />
            {mask && <span>&middot;&middot;&middot;&middot;{mask}</span>}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The caveat that makes a cross-currency comparison honest.
 *
 * "3x points" is only worth more than "2% cash back" once a point is given a
 * value, and that value is Juniper's estimate rather than the issuer's. This chip
 * rides on every figure that used it. If it ever stops being rendered, the page
 * starts presenting a house assumption as a published rate, which is the same
 * class of claim the fabricated 726 credit score was making before #131 removed
 * it.
 *
 * Credit Karma's own Cards Optimizer sidesteps this entirely by showing "3x
 * points" and never comparing across currencies. Juniper does compare, so Juniper
 * owes the disclosure.
 */
export function AssumesPointValue({ cents }: { cents?: number | null }) {
  const rate = cents != null && cents > 0 ? `${cents}¢/pt` : "a point value";
  return (
    <span className="cr-assume" title={`Comparing points against cash back requires a value per point. Juniper assumes ${rate}. Your own redemptions may be worth more or less.`}>
      Assumes {rate}
    </span>
  );
}

/**
 * Where the rates came from, and how much to trust them.
 *
 * The catalog is hand-assembled because no product Juniper integrates returns
 * card rewards terms (Plaid's `liabilities` returns APRs and limits, not earn
 * rates). Curated data goes stale silently, so `verified` is false on everything
 * migration 0032 seeded and this note says so for as long as that is true of any
 * card the member holds.
 */
export function RewardsProvenance({
  asOf,
  anyUnverified,
  assumesPointValue,
  children,
}: {
  asOf: string | null;
  anyUnverified: boolean;
  assumesPointValue: boolean;
  children?: React.ReactNode;
}) {
  const when = readableDate(asOf);
  return (
    <div className="cr-prov">
      {when && <>Rates as published by each issuer, read on {when}</>}
      {when && anyUnverified && <>, and <b>not yet re-checked against the issuer's own page</b></>}
      {when && ". "}
      {anyUnverified && <>Worth confirming with your issuer before you act on a large purchase. </>}
      {assumesPointValue && (
        <>Figures comparing a points card against a cash-back card use Juniper's own value per point,
        which is an estimate and not the issuer's. </>
      )}
      {children}
    </div>
  );
}
