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
  network,
  brandColor,
  logoSrc,
  size = "md",
  unknown = false,
  hand = false,
  label,
  layout = "card",
  artUrl,
}: {
  issuer?: string;
  /** Use the SHORT name (`product.short_name`). The stored name is up to 53
      characters and ellipsizes on every size below. */
  productName?: string;
  mask?: string | null;
  /** Set in PLAIN TYPE, never as the network's own logo. "Visa" as a word states
      a fact about the card the member holds; reproducing Visa's mark and colours
      would be using their brand asset, which is the line this component exists
      to stay on the right side of. */
  network?: string | null;
  brandColor?: string | null;
  /** The institution's own mark, resolved by the caller through the same chain
      Connections uses. Absent is fine and common: plenty of banks have no logo. */
  logoSrc?: string | null;
  size?: CardFaceSize;
  /** No product confirmed yet, so draw the outline rather than a colour. */
  unknown?: boolean;
  /**
   * A card the member entered by hand (migration 0046), so Juniper knows its name
   * and nothing else about it.
   *
   * A THIRD state, not a shade of `unknown`. An unknown card is one Juniper is
   * ASKING about and its face is a prompt. A hand-entered card has already been
   * answered, by the member, in full: it has a name and a mask and it is not
   * waiting for anything. It just has no product behind it, so there is no brand
   * colour to borrow and no art to draw, which is a fact about the catalog rather
   * than about the member.
   *
   * Drawn as a neutral face with a dashed edge: enough to say "this one is yours,
   * not your bank's" beside three branded cards, without implying it is broken.
   */
  hand?: boolean;
  /** Overrides the product name, for the outline state ("Which card?"). */
  label?: string;
  /**
   * `strip` rearranges the face for the wallet pocket, where only the top ~54px
   * is visible and everything identifying has to fit inside it.
   *
   * This is a component prop rather than CSS because the fix needs the MASK on
   * the issuer's line, and `order` only reorders siblings: the mask sits inside
   * the name's wrapper, two levels from the issuer. Two CSS attempts show why it
   * matters. Name and mask stacked clipped the mask to "·1575"; side by side they
   * left about 85px for the name, so both Discover cards read "Disco...". Issuer
   * plus mask on one line and the name alone on the next is the only arrangement
   * where five cards in a pocket are all distinguishable.
   */
  layout?: "card" | "strip";
  /**
   * Real card art, when the catalog has a licensed URL for this product
   * (migration 0035). Absent renders the synthesized face, which is what the
   * catalog ships with, so this is an upgrade path rather than a requirement.
   *
   * Art REPLACES the drawing but not the labelling. Every issuer puts the product
   * name somewhere different on the artwork, so a stack relying on the image to
   * identify a hidden card would be legible for Chase and not for Discover. The
   * strip layout keeps painting its own name and mask over the top.
   */
  artUrl?: string | null;
}) {
  const art = !unknown && !hand && artUrl ? artUrl : null;
  // `cr-face-strip` is on the element rather than inferred from an ancestor,
  // because the stylesheet has to tell the two layouts apart. With art present a
  // FULL face hides its labels (the artwork carries its own branding), and a
  // STRIP must not: its labels are the only thing identifying a card whose body
  // is covered. Without this class the strip inherited the full face's rule and
  // lost the issuer and mask line, which is the mask that tells two Chase cards
  // apart.
  const cls = [
    "cr-face", `cr-face-${size}`,
    unknown ? "cr-face-unk" : "",
    hand ? "cr-face-hand" : "",
    art ? "cr-face-art" : "",
    layout === "strip" ? "cr-face-strip" : "",
  ].filter(Boolean).join(" ");
  // The face carries light text over the brand colour, and Plaid's brand colours
  // run from near-white golds to near-black navies. `brandTint` already measures
  // Rec. 709 luma for exactly this problem on the Connections monogram tiles, so
  // the ink is reused from there rather than assumed to be white: a white product
  // name on a pale gold card is unreadable.
  //
  // The gradient is derived in CSS from `--cr-brand`, so a flat hex reads as a
  // moulded surface and nothing new has to be stored per product.
  // No tint on a hand-entered card for the same reason as an unknown one: no
  // product was named, so no brand colour is licensed. `.cr-face-hand` paints a
  // neutral surface in CSS instead.
  const tint = unknown || hand ? null : brandTint(brandColor);
  const style = tint
    ? ({ ["--cr-brand" as string]: tint.background, color: tint.color } as React.CSSProperties)
    : undefined;
  /**
   * THE ISSUER'S MARK IS DROPPED WHERE THE ARTWORK ALREADY CARRIES IT.
   *
   * `.cr-face-logo` flattens Plaid's mark to a pure white silhouette
   * (`brightness(0) invert(1)`), which is right on a synthesized face: Plaid
   * ships dark marks meant for a light tile and they would vanish into a navy
   * card. On a face showing REAL ART it is wrong twice over. The artwork is the
   * issuer's own branding, so the silhouette is a second mark competing with the
   * first; and flattened to white it reads as a blank circle or square laid over
   * the card rather than as a logo, which is how it was reported.
   *
   * The issuer NAME takes its place, which is what the stylesheet was already
   * written for: `.cr-pocket .cr-face-art .cr-face-iss` sets it white with a
   * text-shadow for exactly this case, and was unreachable for every institution
   * that has a logo, which is most of them.
   *
   * Only the strip layout ever sees this. A full face with art hides its whole
   * top line, mark and all, because there the labels are the artwork's job.
   *
   * DIVISION OF LABOUR with the stylesheet, so this does not read as two
   * mechanisms for one outcome. This decides whether the issuer's MARK is drawn,
   * because that is a question about which element to render at all. The
   * stylesheet decides whether the issuer NAME and the PRODUCT NAME are drawn
   * (`.cr-pocket .cr-face-art .cr-face-iss/.cr-face-nm`), because those elements
   * exist either way and it is purely a question of showing them. On an art face
   * in the strip the net effect of both is the same and deliberate: the mask, and
   * nothing else, over the artwork.
   */
  const showLogo = !!logoSrc && !art;

  const name = label ?? productName ?? "";
  const tiny = size === "sm";
  const maskEl = mask
    ? <span className="cr-face-mask">&middot;&middot;&middot;&middot;{mask}</span>
    : null;

  // The image sits behind everything and is decorative: the product name is
  // always in the DOM as text beside or over it, so alt="" is correct rather than
  // lazy. onError drops back to the synthesized face, because a broken-image icon
  // where a card should be reads as a fault in the money rather than a missing
  // asset, which is the same call MerchantMark makes for merchant logos.
  const artEl = art
    ? <img
        className="cr-face-img"
        src={art}
        alt=""
        loading="lazy"
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = "none";
          el.closest(".cr-face")?.classList.remove("cr-face-art");
        }}
      />
    : null;

  if (tiny) {
    // A swatch. With art it is a recognizable thumbnail of the card; without, it
    // is a colour chip that ties a chip or a row back to a card.
    return (
      <span className={cls} style={style} aria-hidden="true">
        {artEl}
      </span>
    );
  }

  if (layout === "strip") {
    return (
      <span className={cls} style={style} aria-hidden="true">
        {artEl}
        <span className="cr-face-in">
          <span className="cr-face-top">
            {showLogo
              ? <img className="cr-face-logo" src={logoSrc!} alt="" />
              : <span className="cr-face-iss">{issuer}</span>}
            {maskEl}
          </span>
          {name && <span className="cr-face-nm">{name}</span>}
          {/* Pushed to the bottom, so it never competes for the visible strip. */}
          <span className="cr-face-mid"><span className="cr-face-chip" /></span>
        </span>
      </span>
    );
  }

  return (
    <span className={cls} style={style} aria-hidden="true">
      {artEl}
      <span className="cr-face-in">
        <span className="cr-face-top">
          {showLogo
            ? <img className="cr-face-logo" src={logoSrc!} alt="" />
            : <span className="cr-face-iss">{issuer}</span>}
          {/* A generic contactless glyph, not a network asset. */}
          {!unknown && (
            <svg className="cr-face-wave" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 8a10 10 0 0 1 0 8M9.5 6a14 14 0 0 1 0 12M14 4a18 18 0 0 1 0 16"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        <span className="cr-face-mid">
          <span className="cr-face-chip" />
        </span>
        <span className="cr-face-bot">
          <span className="cr-face-idw">
            {name && <span className="cr-face-nm">{name}</span>}
            {maskEl}
          </span>
          {network && !unknown && <span className="cr-face-net">{network}</span>}
        </span>
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
