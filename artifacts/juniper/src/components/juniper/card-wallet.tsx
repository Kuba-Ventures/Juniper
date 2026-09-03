import { useEffect, useRef, useState } from "react";
import { CardFace } from "@/components/juniper/card-rewards-bits";
import { limitOf, money0, type CardRewards, type LimitSource, type LinkedCard } from "@/lib/cards";
import { holderClass, type HolderStyle } from "@/lib/holder-style";
import { utilizationBand, utilizationPct } from "@/lib/credit-balance";
import { Info, X } from "lucide-react";

// The card holder: cards stacked in a pocket, each revealing a strip of itself.
// Split out of rewards-guide.tsx for issue #264, which asks for the holder to sit
// on its own, second on the page (score, then the holder, then the card list),
// rather than paired with the rewards hero it used to share a row with. Nothing
// about the wallet's own behaviour changed in the split; only where it is
// mounted did.
//
// Treatment A of three, rendered in design/card-wallet-variants.html. Replaces a
// horizontal fan, and the reason is not taste. In ANY overlapping stack the
// visible band of a hidden card is narrow, and whatever identifies it has to sit
// inside that band. A horizontal fan leaves the RIGHT edge showing, where the
// network name is, so it read "VISA VISA RCARD COVER"; vertical leaves the TOP
// strip, where the issuer and the name are. Vertical also scales: a fifth card
// costs 54px of height rather than 52px of width it does not have.
//
// The cost, and it is real: the product name has to live at the top of the face
// in this layout, off the bottom where embossing actually is.
//
// ── WHAT IS DRAWN, AND WHY THAT CHANGED ───────────────────────────────────
//
// This used to draw CONFIRMED cards only. The reason recorded here was that an
// unidentified card has no brand colour to borrow, so an outline in the pocket
// would read as a rendering fault rather than as a card waiting to be named,
// which the identify prompt above the wallet already handles.
//
// THE EVIDENCE CAME BACK AGAINST IT. The header beside this stack says "2 of 3
// cards identified, 1 still to go", and a real member read that against a stack
// of two as their Chase card having gone MISSING, not as a card awaiting a name.
// That is precisely the confusion the original decision meant to prevent, so the
// decision is reversed: the count and the stack now agree, because a header that
// says three over a pocket holding two invites the reading that something was
// lost, and losing a card is the worse thing to imply on a money page.
//
// Two things make the outline read as a prompt rather than as a fault, and both
// are load-bearing:
//
//   1. IT IS LABELLED. `CardFace`'s `unknown` prop draws the outline and `label`
//      names it, the same pair the identify prompt itself already uses. A blank
//      outline would deserve the original objection; "Which card?" does not.
//   2. IT IS TAPPABLE, straight through to the picker. An outline that does
//      nothing is what the original comment was rightly afraid of; an outline
//      that takes you to the answer is not the same object.
//
// The outlines are drawn LAST, after every confirmed card, and it is worth being
// exact about what that means in this layout, because it is not what "last"
// usually implies. Each card sits `REVEAL` lower than the one before and on top
// of it, so every card but the final one shows only its top strip: last means
// FRONT and fully visible, not tucked away.
//
// That is the right place for it. The outline is the only slot in the pocket with
// something to do, so it earns the front, and putting it earlier would push the
// member's real cards down behind an unanswered one and reorder a stack they
// recognize. It also keeps the confirmed cards in the order they were already
// drawn in, which is the order the guide and the switch rows use.

/**
 * The holder's geometry, and every one of these has to agree with juniper.css.
 *
 * `FACE_H` used to say 124 with a comment claiming it matched `.cr-face-lg`. It
 * did not: that rule is 149px tall at desktop and drops to 126px only under a
 * media query, so every computed height was 25px short. Combined with nothing
 * clipping the stack, collapsing reserved 148px for 257px of content and 109px
 * of card hung out below the holder. Both are fixed here and in the stylesheet.
 *
 * The card is measured rather than assumed now: `.cr-holder-card` is
 * left/right-anchored so its WIDTH comes from the holder, and the height follows
 * from the 1.586 ISO/IEC 7810 ID-1 aspect ratio every credit card in the world
 * has. So a holder that changes width cannot desynchronize from a constant here.
 */
const HOLDER_W = 262 - 24 - 2;          // .cr-holder width less its padding AND its 1px border
// The border was the missing 2px: every holder finish carries `border:1px solid`
// and the box is border-box, so the inner width a card is stretched to is 236,
// not 238. Measured in the browser after the face was made to fill its slot.
const FACE_H = Math.round(HOLDER_W / 1.586); // ID-1: 85.60mm x 53.98mm
/**
 * How much of each card shows, and this is now the SAME for every card including
 * the front one, which is the change a real holder forced.
 *
 * The front card used to lie fully visible on top of the pocket, which is not
 * how a wallet works: every card is IN the holder and the holder's front panel
 * crosses all of them. So `.cr-holder-cover` sits in front of the whole stack and
 * each card shows about a quarter of itself, which is what the reference
 * photograph shows and what makes four cards legible in the height of one.
 */
const REVEAL = Math.round(FACE_H / 4);   // a quarter of the card
/**
 * The reveal when the member opens the holder, restoring the control #248 took
 * out and taking Credit Karma's answer to what it is for.
 *
 * #248 removed a collapse that only tightened the reveal, correctly: it cost a
 * line of copy to save 44px. This is the other direction. Tucked, the holder is a
 * summary - four strips and a total. Open, it is the stack itself, each card
 * showing enough of its artwork to be recognised rather than read. That is worth
 * a control where "44px shorter" was not.
 */
const REVEAL_OPEN = Math.round(FACE_H * 0.56);
/**
 * The front panel's height, matching `.cr-holder-cover`.
 *
 * Deep rather than thin, and the depth is now load-bearing: the panel CARRIES THE
 * FIGURES. It states the count, the total reported balance and the utilization
 * sentence, which is what Credit Karma's Cards Optimizer puts on the same surface
 * and what 120px of blank leather was quietly asking for.
 *
 * 84 read as a strip laid under the cards; 120 read as a panel with nothing on
 * it. 168 is the block plus the stitch above it plus the margin the numbers need
 * from the bottom edge, measured rather than guessed.
 */
const COVER_H = 168;
/**
 * How much wider the popped card is than the holder, per side.
 *
 * The card comes OUT of the holder rather than growing inside it, and the
 * overhang is the whole reason that reads: a card that stops at the leather's
 * edge looks like a bigger card in the wallet. Credit Karma's does the same, and
 * it is the one part of their popup that cannot be faked with a shadow.
 */
const POP_OUT = 11;
/** The slot band's height, matching `.cr-holder-band`. */
const BAND_H = 7;

/**
 * One place in the holder, and everything the panel needs to describe it.
 *
 * The figures are resolved when the slot is built rather than where they print,
 * because the limit precedence (`limitOf`) already has one definition and a
 * second reader would be a second answer to "what is this card's limit".
 */
interface Slot {
  key: string;
  /** The linked card, or null for an outline or a hand-entered one. */
  card: LinkedCard | null;
  label: string;
  mask: string | null;
  issuer: string;
  hand: boolean;
  art: string | null;
  brand: string | null;
  owed: number;
  inCredit: number;
  limit: number | null;
  limitSource: LimitSource;
  currency: string | null;
}

/**
 * The figures the holder's front panel carries.
 *
 * WHY THEY LIVE ON THE LEATHER. This is Credit Karma's Cards Optimizer move and
 * it is the right one: the panel crossing the cards is the most-looked-at surface
 * in the component, and it was carrying a two-word count. The figures are the
 * reason somebody looks at a wallet.
 *
 * WHAT THIS MUST NOT DO is disagree with the Credit page's own utilization card,
 * which was the stated reason the wallet showed no money at all. It cannot now:
 * the balance is a plain sum of the same `Slot` figures the list above is built
 * from, the percentage uses the same `utilizationPct`, and the scope is said out
 * loud whenever a card has no limit to be measured against. Two surfaces reading
 * one set of rows can be redundant. They cannot contradict.
 */
function CoverFigures({
  label, amount, currency, used, limit, scope, fallback,
}: {
  label: string;
  amount: number;
  currency: string | null;
  /** Null where no limit is known, which is not the same as zero. */
  used: number | null;
  limit: number | null;
  /** "across 3 of 4 cards", where some card has no limit to be counted in. */
  scope?: string;
  /** What the sentence says instead when there is no percentage to state. */
  fallback: string;
}) {
  const band = utilizationBand(used);
  return (
    <>
      <div className="hp-k">{label}</div>
      <div className="hp-v tnum">{money0(amount, currency)}</div>
      <div className="hp-u">
        {band && used != null && limit != null ? (
          <>
            <b>{band}</b> {used}% used of {money0(limit, currency)} limit{scope}{" "}
            <span
              className="hp-i"
              title="Utilization is what you owe divided by your limit. Under 10% is the band scoring models reward."
            >
              <Info size={11} aria-hidden="true" />
            </span>
          </>
        ) : (
          fallback
        )}
      </div>
    </>
  );
}

/**
 * The card, out of the holder.
 *
 * Wider than the holder by `POP_OUT` on each side and drawn OVER the stack, which
 * together are what make it read as the card coming out rather than a picture of
 * the card appearing. It is not a modal: no backdrop, no portal, nothing else on
 * the page dimmed. Tapping a card in a wallet should not take over a page, and
 * the sheet that used to do exactly that is what this replaces.
 *
 * `layout` is the full face rather than the strip. In the holder the labels are
 * painted over the artwork because a covered card has nothing else to identify
 * it; here nothing is covering it, so the artwork speaks and the labels come off.
 */
function PoppedCard({
  slot, logoSrc, closeRef, onClose,
}: {
  slot: Slot;
  logoSrc: string | null;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  return (
    <div
      className="cr-pop"
      role="group"
      aria-label={`${slot.label}${slot.mask ? `, ····${slot.mask}` : ""}`}
    >
      <CardFace
        size="lg"
        issuer={slot.issuer}
        unknown={!slot.card && !slot.hand}
        hand={slot.hand && !slot.art && !slot.brand}
        productName={slot.card || slot.hand ? slot.label : undefined}
        label={slot.card || slot.hand ? undefined : slot.label}
        mask={slot.mask}
        brandColor={slot.card?.product?.brand_color ?? slot.brand}
        artUrl={slot.card?.product?.art_url ?? slot.art}
        logoSrc={logoSrc}
      />
      <button
        type="button"
        className="cr-pop-x"
        onClick={onClose}
        ref={closeRef}
        aria-label={`Put ${slot.label} back`}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function CardWallet({
  cards,
  unidentified,
  manual,
  logoFor,
  onIdentify,
  holderStyle,
}: {
  cards: LinkedCard[];
  /** Cards still to be named, drawn as labelled outlines after the real ones. */
  unidentified: CardRewards["unidentified"];
  /** Cards the member entered by hand (migration 0046), drawn last of all. */
  manual: CardRewards["manual"];
  logoFor: (c: LinkedCard) => string | null;
  /** Opens the identify picker. See the note in the docblock about why an
      outline that does nothing would be worse than no outline at all. */
  onIdentify: () => void;
  /** Which holder the member chose (migration 0048), or null for the default. */
  holderStyle: HolderStyle | null;
}) {
  const withProduct = cards.filter((c) => c.product);
  // Which card is OUT of the holder, by slot key. Was "which card's sheet is
  // open", and before that "which card is raised 7px". The card now comes out of
  // the wallet in place: no portal, no backdrop, nothing else on the page dimmed.
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** Whether the holder is open, showing more of each card. See REVEAL_OPEN. */
  const [open, setOpen] = useState(false);
  // Focus follows the card out and back again. Without the second half, closing
  // a popped card drops focus to the top of the document, which for a keyboard
  // member is the whole page over again.
  const closeRef = useRef<HTMLButtonElement>(null);
  const cameFrom = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (openKey) closeRef.current?.focus();
  }, [openKey]);
  // Escape puts the card back. It is not a dialog, so nothing else does this for
  // us, and it is the key everybody presses at a thing lying over other things.
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenKey(null); cameFrom.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);
  if (!withProduct.length) return null;

  // ONE list, confirmed first and outlines last, so the pocket's count and the
  // header's "N of M identified" describe the same set. See the docblock: a
  // header saying three over a stack of two reads as a card having gone missing.
  const slots: Slot[] = [
    ...withProduct.map((c) => ({
      key: c.plaid_account_id, card: c, issuer: c.institution,
      label: c.product?.short_name ?? c.account_name, mask: c.mask, hand: false,
      art: null, brand: null,
      // What the panel prints. Resolved HERE, once, from the same limit
      // precedence `limitOf` defines, rather than recomputed where it prints: two
      // places deciding which limit a card uses is two answers to one question.
      owed: c.balance, inCredit: c.inCredit,
      limit: limitOf(c).limit, limitSource: limitOf(c).source, currency: c.currency,
    })),
    ...unidentified.map((u) => ({
      // Prefixed: an unidentified card's `plaid_account_id` is in the same
      // namespace as a confirmed one's, and the two lists are disjoint today, but
      // a key collision here would silently drop a face rather than error.
      key: `unk:${u.plaid_account_id}`, card: null, issuer: u.institution,
      label: "Which card?", mask: u.mask, hand: false, art: null, brand: null,
      owed: u.balance, inCredit: 0, limit: u.limit, limitSource: "bank" as LimitSource,
      currency: u.currency,
    })),
    // Hand-entered cards LAST OF ALL, after even the outlines. The pocket then
    // holds every credit card the page knows about, in descending order of how
    // much Juniper can say about each: identified, then asked-about, then the
    // ones it knows only because the member typed them.
    ...manual.map((m) => ({
      key: `hand:${m.manual_account_id}`, card: null, issuer: m.institution,
      // The product's short name once the member has named it (0047), their own
      // label until then. Theirs is the better fallback: "Freedom Unlimited" is
      // what they typed and what they call it.
      label: m.product?.short_name || m.account_name,
      mask: m.mask, hand: true,
      // Identity only. A named card gets its real art and colour and stops
      // looking like the one thing in the pocket Juniper could not draw.
      art: m.product?.art_url ?? null,
      brand: m.product?.brand_color ?? null,
      owed: m.balance, inCredit: m.inCredit, limit: m.limit,
      // A hand-entered limit is the member's own, always. There is no bank
      // behind it, which is the reason the account exists.
      limitSource: (m.limit != null ? "member" : "none") as LimitSource,
      currency: m.currency,
    })),
  ];

  // EVERY card is drawn in both states. Collapsing used to render only the first
  // three, which is what made "4 cards" sit above a stack of three, and it never
  // needed to: closing the holder tightens the reveal, it does not hide cards.
  // A member with eight cards gets a shorter holder, not a truncated one.
  // The clip's height, and the clip is what keeps the stack inside the holder:
  // every card is FACE_H tall and only REVEAL of it is meant to show, so without
  // `overflow:hidden` the last one hangs out. That was the reported bug.
  //
  // The front card gets the same reveal as the others and then the cover crosses
  // it, which is the whole point of the cover: nothing lies ON the holder.
  //
  // THE HOLDER OPENS AGAIN, which reverses #248 rather than forgetting it. That
  // change removed a collapse that only tightened the reveal, and it was right:
  // a line of copy to save 44px. This control does something else. Tucked, the
  // holder is a summary - four strips and one total. Open, it is the stack, each
  // card showing enough of itself to be recognised. Both are worth having.
  //
  // A CARD COMING OUT TUCKS THE STACK BEHIND IT, without forgetting that the
  // member had opened it. An open holder is 332px of stack and the popped card is
  // 179px of card, so the bottom half of an expanded stack went on showing under
  // a card that was supposed to be out of it. The open state is kept in `open`
  // and restored the moment the card goes back.
  const reveal = open && !openKey ? REVEAL_OPEN : REVEAL;
  const clipH = reveal * slots.length + COVER_H;

  // The card that is out of the holder, if any. Looked up rather than asserted: a
  // refresh landing while a card is out can retire it, and a stale key has to put
  // the holder back rather than throw inside it.
  const popped = openKey ? slots.find((x) => x.key === openKey) ?? null : null;
  const putBack = () => { setOpenKey(null); cameFrom.current?.focus(); };

  // WHAT THE PANEL SAYS WHEN NOTHING IS OUT: every card, one figure.
  //
  // The balance is a plain sum over every card, because "total reported balance"
  // is a sum and a card without a limit still has one. The PERCENTAGE is not: it
  // can only include cards with a limit to be measured against, exactly as the
  // Credit page's utilization card does, and it says so out loud when the two
  // sets differ rather than quietly describing three cards as four.
  const currency = slots.find((s) => s.currency)?.currency ?? null;
  const owedAll = slots.reduce((a, s) => a + s.owed, 0);
  const creditAll = slots.reduce((a, s) => a + s.inCredit, 0);
  const measurable = slots.filter((s) => s.limit != null && s.limit > 0);
  const limitAll = measurable.reduce((a, s) => a + (s.limit ?? 0), 0);
  const usedAll = utilizationPct(measurable.reduce((a, s) => a + s.owed, 0), limitAll);
  const scope = measurable.length !== slots.length
    ? ` across ${measurable.length} of ${slots.length} cards`
    : "";
  // A card in credit is never drawn as debt. Same rule as the Credit list, and
  // the reason `Slot` carries the two halves separately.
  const netCredit = owedAll === 0 && creditAll > 0;

  const poppedUsed = popped ? utilizationPct(popped.owed, popped.limit) : null;

  return (
    <div className={`cr-holder ${holderClass(holderStyle)}`}>
      <div className="cr-holder-clip" style={{ height: clipH }}>
      {/* THE STACK, wrapped so the figures below can sit in the same clip without
          being made inert with it. Inert while a card is out, so tab does not walk
          through a stack standing behind an opaque card. */}
      <div className="cr-holder-stack" inert={popped ? true : undefined}>
      {slots.map((s, i) => {
        const c = s.card;
        const known = !!c || s.hand;
        return (
          <button
            type="button"
            key={s.key}
            className="cr-holder-card"
            style={{ top: i * reveal, height: FACE_H, zIndex: (i + 1) * 10 }}
            // Says what tapping DOES, and the two do different things: a card
            // Juniper can describe comes out of the holder, and an outline opens
            // the picker, because there is nothing to bring out yet.
            aria-label={known ? `${s.label}, ····${s.mask ?? ""}` : `Identify your ${s.issuer} card`}
            // No pressed state on either. Both open something and neither is a
            // toggle, which is what `aria-pressed` claims.
            onClick={(e) => {
              if (known) { cameFrom.current = e.currentTarget; setOpenKey(s.key); }
              else onIdentify();
            }}
          >
            <CardFace
              size="lg"
              layout="strip"
              issuer={s.issuer}
              // `unknown` draws the outline and `label` names it. The pair is the
              // same one the identify prompt itself uses, so the two surfaces
              // cannot describe the same state differently. A hand-entered card is
              // NOT unknown: the member told us what it is, so it gets a real name
              // and a face, just an unbranded one.
              // A NAMED hand-entered card is no longer drawn as a hand-entered
              // one: it has real art and a real colour, so it draws like any
              // other card. The neutral face says "Juniper cannot draw this",
              // and once it can, that is no longer true.
              unknown={!c && !s.hand}
              hand={s.hand && !s.art && !s.brand}
              productName={c || s.hand ? s.label : undefined}
              label={c || s.hand ? undefined : s.label}
              mask={s.mask}
              brandColor={c?.product?.brand_color ?? s.brand}
              artUrl={c?.product?.art_url ?? s.art}
              logoSrc={c ? logoFor(c) : null}
            />
          </button>
        );
      })}
      {/* THE SLOT each card is tucked into, drawn above that card and below the
          one before it, so the band appears to be in front of the card it holds
          and behind the card overlapping it. That ordering is the whole illusion.
          Skipped for the first card, which has no slot above it, and decorative
          throughout, so it must not eat taps meant for the cards. */}
      {slots.slice(1).map((s, i) => (
        <span
          key={`band:${s.key}`}
          className="cr-holder-band"
          aria-hidden="true"
          style={{ top: (i + 1) * reveal - BAND_H, zIndex: (i + 1) * 10 + 5 }}
        />
      ))}
      {/* THE COVER: the wallet's front panel, in front of every card rather than
          behind the last one. It is why each card shows only its top quarter and
          why none of them appears to be resting on top of the holder. Decorative,
          so it must not eat taps meant for the cards it crosses; the figures on
          top of it are their own layer. */}
      <div className="cr-holder-cover" aria-hidden="true" style={{ height: COVER_H }} />
      </div>

      {/* THE FIGURES, on the leather. Two states, one shape: the holder's total
          when everything is tucked in, and the card's own the moment one is out.
          The chip row is dropped while a card is out, because the card is over
          that part of the panel - the same reason Credit Karma's popup has no
          header of its own.

          INSIDE THE CLIP, and against its bottom edge, because that edge is the
          cover's. Anchored to the holder instead, the figures sat 13px off the
          BOTTOM OF THE HOLDER, and the action bar - which grows the holder by
          however tall its sentence wraps - slid straight over them. */}
      <div className="cr-holder-panel">
        {popped ? (
          <CoverFigures
            label={popped.inCredit > 0 ? "Card in credit" : "Card reported balance"}
            amount={popped.inCredit > 0 ? popped.inCredit : popped.owed}
            currency={popped.currency}
            used={poppedUsed}
            limit={popped.limit}
            fallback={
              popped.limitSource === "none"
                ? "No limit reported for this card, so there is nothing to measure the balance against."
                : "No limit known for this card yet."
            }
          />
        ) : (
          <>
            <div className="hp-top">
              {/* Counts the outlines AND the hand-entered cards, so the chip, the
                  stack and the "N cards" on the Credit list above all say the same
                  number. The header underneath is the one that breaks it down. */}
              <span className="hp-chip">
                {slots.length} {slots.length === 1 ? "card" : "cards"}
              </span>
              <button
                type="button"
                className="hp-toggle"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {open ? "Collapse" : "Show all"}
              </button>
            </div>
            <CoverFigures
              label={netCredit ? "Total in credit" : "Total reported balance"}
              amount={netCredit ? creditAll : owedAll}
              currency={currency}
              used={usedAll}
              limit={limitAll > 0 ? limitAll : null}
              scope={scope}
              fallback="None of your cards reports a limit yet, so there is nothing to measure these balances against."
            />
          </>
        )}
      </div>
      </div>

      {popped && (
        <PoppedCard
          slot={popped}
          logoSrc={popped.card ? logoFor(popped.card) : null}
          closeRef={closeRef}
          onClose={putBack}
        />
      )}

      {/* THE ACTION BAR, and it is only drawn where there is an action. Credit
          Karma's says "Link card" because the card in their popup is not linked;
          ours says the same thing for the same reason, and says nothing at all
          for a card that is already linked and named rather than inventing a
          destination for it. A hand-entered card wants "Link this card" too, but
          that is the Connections flow and this component has no handler for it -
          the prop to add is a sibling of `onIdentify`. */}
      {popped && !popped.card && !popped.hand && (
        <div className="cr-holder-bar">
          <span>Name this card and Juniper can tell you what it earns.</span>
          <button type="button" className="cr-holder-cta" onClick={onIdentify}>
            Identify
          </button>
        </div>
      )}
    </div>
  );
}
