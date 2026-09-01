import { useState } from "react";
import { CardFace, AssumesPointValue, RewardsProvenance } from "@/components/juniper/card-rewards-bits";
import { faceInfoMap, money0, pointValueMap, type CardRewards, type GuideEntry, type LinkedCard } from "@/lib/cards";
import { holderClass, type HolderStyle } from "@/lib/holder-style";
import { limitOf, type LimitSource } from "@/lib/cards";
import { utilizationPct } from "@/lib/credit-balance";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { X } from "lucide-react";

// The card-art hero and the rewards earning guide. Treatment A of three
// (design/card-rewards-variants.html), issue #168.
//
// ── WHAT THIS TAKES FROM CREDIT KARMA AND WHAT IT CHANGES ──────────────────
//
// Takes: the stacked card faces over the reported balance, and a per-category
// list naming which of YOUR cards wins, with the fine print and a chip for a tie.
// That shape is genuinely good and the screenshots on #168 are why.
//
// Changes three things.
//
//   1. THE CATEGORY LIST IS THE MEMBER'S OWN, in their own spend order, rather
//      than a fixed Groceries / Gas / Dining / Travel. A member who spends
//      nothing on gas does not need a gas row, and one whose largest category is
//      Pharmacy should see Pharmacy first. The server orders it (see
//      api/card-rewards.ts) because it is the side that has the spend.
//   2. EACH ROW CARRIES WHAT THEY ACTUALLY SPEND THERE. Without it the guide is
//      a rate table; with it, it is a statement about their money, and it is
//      also what makes the ordering legible rather than arbitrary.
//   3. A CROSS-CURRENCY COMPARISON IS LABELLED AS AN ASSUMPTION. Credit Karma
//      shows "3x points" and never compares it against a cash-back card, so it
//      never owes this. Juniper picks a winner across currencies, so it does.

// The category icon comes from the member's own taxonomy on the server side in
// principle, but the guide rows arrive as ids and labels only, so the icon is
// resolved here from the same emoji table the rest of the app draws. Falling back
// to the group parcel rather than to nothing, for the same reason
// _categorize.ts's own default does: a ragged half-iconed list reads as broken.
const CATEGORY_ICON: Record<string, string> = {
  c_groceries: "🛒", c_restaurants_bars: "🍽️", c_coffee_shops: "☕",
  c_gas: "⛽", c_auto_parking: "🅿️", c_rides_transit: "🚕", c_car_payment: "🚙",
  c_travel: "✈️", c_entertainment: "🎬", c_streaming_music: "🎵",
  c_pharmacy: "💊", c_medical: "🏥", c_fitness: "🏋️", c_personal_care: "💇",
  c_clothing: "👕", c_electronics: "💻", c_shopping: "🛍️", c_gifts_donations: "🎁",
  c_rent: "🏠", c_mortgage: "🏦", c_home_repairs: "🔨",
  c_utilities: "💡", c_phone_internet: "📱", c_insurance: "🛡️",
  c_education: "📚", c_services: "🔧", c_childcare: "👶",
};
const iconFor = (categoryId: string) => CATEGORY_ICON[categoryId] ?? "📦";

/**
 * The wallet: cards stacked in a pocket, each revealing a strip of itself.
 *
 * Treatment A of three, rendered in design/card-wallet-variants.html. Replaces a
 * horizontal fan, and the reason is not taste. In ANY overlapping stack the
 * visible band of a hidden card is narrow, and whatever identifies it has to sit
 * inside that band. A horizontal fan leaves the RIGHT edge showing, where the
 * network name is, so it read "VISA VISA RCARD COVER"; vertical leaves the TOP
 * strip, where the issuer and the name are. Vertical also scales: a fifth card
 * costs 54px of height rather than 52px of width it does not have.
 *
 * The cost, and it is real: the product name has to live at the top of the face
 * in this layout, off the bottom where embossing actually is.
 *
 * ── WHAT IS DRAWN, AND WHY THAT CHANGED ───────────────────────────────────
 *
 * This used to draw CONFIRMED cards only. The reason recorded here was that an
 * unidentified card has no brand colour to borrow, so an outline in the pocket
 * would read as a rendering fault rather than as a card waiting to be named,
 * which the identify prompt above the wallet already handles.
 *
 * THE EVIDENCE CAME BACK AGAINST IT. The header beside this stack says "2 of 3
 * cards identified, 1 still to go", and a real member read that against a stack
 * of two as their Chase card having gone MISSING, not as a card awaiting a name.
 * That is precisely the confusion the original decision meant to prevent, so the
 * decision is reversed: the count and the stack now agree, because a header that
 * says three over a pocket holding two invites the reading that something was
 * lost, and losing a card is the worse thing to imply on a money page.
 *
 * Two things make the outline read as a prompt rather than as a fault, and both
 * are load-bearing:
 *
 *   1. IT IS LABELLED. `CardFace`'s `unknown` prop draws the outline and `label`
 *      names it, the same pair the identify prompt itself already uses. A blank
 *      outline would deserve the original objection; "Which card?" does not.
 *   2. IT IS TAPPABLE, straight through to the picker. An outline that does
 *      nothing is what the original comment was rightly afraid of; an outline
 *      that takes you to the answer is not the same object.
 *
 * The outlines are drawn LAST, after every confirmed card, and it is worth being
 * exact about what that means in this layout, because it is not what "last"
 * usually implies. Each card sits `REVEAL` lower than the one before and on top
 * of it, so every card but the final one shows only its top strip: last means
 * FRONT and fully visible, not tucked away.
 *
 * That is the right place for it. The outline is the only slot in the pocket with
 * something to do, so it earns the front, and putting it earlier would push the
 * member's real cards down behind an unanswered one and reorder a stack they
 * recognize. It also keeps the confirmed cards in the order they were already
 * drawn in, which is the order the guide and the switch rows use.
 */
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
const HOLDER_W = 262 - 24;              // .cr-holder width less its padding
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
const REVEAL_OPEN = Math.round(FACE_H / 4);   // a quarter of the card
const REVEAL_CLOSED = 26;
/** The front panel's height, matching `.cr-holder-cover`. It holds the count and
    the collapse toggle, so it cannot be thinner than that text plus its padding. */
const COVER_H = 54;
/** The slot band's height, matching `.cr-holder-band`. */
const BAND_H = 7;

/**
 * One place in the holder, and everything the sheet needs to describe it.
 *
 * The figures are resolved when the slot is built rather than in the sheet,
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
 * The card sheet: one card at full size with what Juniper knows about it.
 *
 * WHY A SHEET RATHER THAN A NUDGE. Tapping a card used to move it seven pixels,
 * which is a leftover from when the holder was a loose stack and raising a card
 * was the only way to read the one behind it. With a cover in front of every
 * card there is nothing to raise it out of, and seven pixels was never an answer
 * to "what is this card"; it was an answer to "which card is on top".
 *
 * It prints the same figures as the Credit list above, and prints them the same
 * way: a card in credit is never drawn as debt, an unknown limit says so rather
 * than reading as 0%, and a member-supplied limit is labelled as theirs. Those
 * rules are not restated here, they are the reason `limitOf`, `utilizationPct`
 * and the `Slot` figures exist.
 */
function CardSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const used = utilizationPct(slot.owed, slot.limit);
  const cur = slot.currency;
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="cs-head">
        <h3 className="cs-h">{slot.label}</h3>
        <button type="button" className="conn-add-x" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      <div className="cs-sub">
        {slot.issuer}
        {slot.mask && <> &middot; &middot;&middot;&middot;&middot;{slot.mask}</>}
        {slot.hand && <span className="cl-mine">You added this</span>}
      </div>
      {/* The card at a size worth looking at, which is the whole point of the
          sheet. `card` layout rather than `strip`: nothing is covering it here,
          so the artwork does not need labels painted over it. */}
      <div className="cs-face">
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
        />
      </div>
      <div className="cs-rows">
        <div className="cs-row">
          <span className="k">{slot.inCredit > 0 ? "In credit" : "Balance"}</span>
          <span className="v tnum">
            {money0(slot.inCredit > 0 ? slot.inCredit : slot.owed, cur)}
          </span>
        </div>
        <div className="cs-row">
          <span className="k">Limit</span>
          <span className="v tnum">
            {slot.limit != null ? money0(slot.limit, cur) : "Not known"}
            {slot.limitSource === "member" && <span className="cl-mine">Yours</span>}
          </span>
        </div>
        <div className="cs-row">
          <span className="k">Used</span>
          {/* Null, not zero. "We do not know" and "you are using none of it" are
              different facts, which is why `utilizationPct` returns null. */}
          <span className="v tnum">{used != null ? `${used}%` : "Unknown"}</span>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function CardWallet({
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
  const [collapsed, setCollapsed] = useState(false);
  // Which card's sheet is open, by slot key. Replaces the old "which card is
  // raised 7px", which stopped meaning anything once a cover sat in front of
  // every card: there is nothing to raise a card out of, and 7px was never an
  // answer to "what is this card".
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!withProduct.length) return null;

  // ONE list, confirmed first and outlines last, so the pocket's count and the
  // header's "N of M identified" describe the same set. See the docblock: a
  // header saying three over a stack of two reads as a card having gone missing.
  const slots: Slot[] = [
    ...withProduct.map((c) => ({
      key: c.plaid_account_id, card: c, issuer: c.institution,
      label: c.product?.short_name ?? c.account_name, mask: c.mask, hand: false,
      art: null, brand: null,
      // What the sheet prints. Resolved HERE, once, from the same limit
      // precedence `limitOf` defines, rather than recomputed in the sheet: two
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
  const step = collapsed ? REVEAL_CLOSED : REVEAL_OPEN;
  // The clip's height, and the clip is what keeps the stack inside the holder:
  // every card is FACE_H tall and only `step` of it is meant to show, so without
  // `overflow:hidden` the last one hangs out. That was the reported bug.
  //
  // The front card gets the same reveal as the others and then the cover crosses
  // it, which is the whole point of the cover: nothing lies ON the holder.
  const clipH = step * slots.length + COVER_H;

  return (
    <div className={`cr-holder ${holderClass(holderStyle)}`}>
      <div className="cr-holder-clip" style={{ height: clipH }}>
      {slots.map((s, i) => {
        const c = s.card;
        const known = !!c || s.hand;
        return (
          <button
            type="button"
            key={s.key}
            className="cr-holder-card"
            style={{ top: i * step, height: FACE_H, zIndex: (i + 1) * 10 }}
            // Says what tapping DOES, and the two do different things: a card
            // Juniper can describe opens its sheet, and an outline opens the
            // picker, because there is nothing to describe yet.
            aria-label={known ? `${s.label}, ····${s.mask ?? ""}` : `Identify your ${s.issuer} card`}
            // No pressed state on either. Both open something and neither is a
            // toggle, which is what `aria-pressed` claims.
            onClick={() => {
              if (known) setOpenKey(s.key);
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
          style={{ top: (i + 1) * step - BAND_H, zIndex: (i + 1) * 10 + 5 }}
        />
      ))}
      {/* THE COVER: the wallet's front panel, in front of every card rather than
          behind the last one. It is why each card shows only its top quarter and
          why none of them appears to be resting on top of the holder. Decorative,
          so it must not eat taps meant for the cards it crosses; the foot's own
          toggle sits above it and is interactive. */}
      <div className="cr-holder-cover" aria-hidden="true" style={{ height: COVER_H }} />
      </div>
      {openKey && (() => {
        const s = slots.find((x) => x.key === openKey);
        // Guarded rather than asserted: a refresh landing while the sheet is open
        // can retire the card it describes, and a stale key must close the sheet
        // rather than throw inside it.
        return s ? <CardSheet slot={s} onClose={() => setOpenKey(null)} /> : null;
      })()}
      <div className="cr-holder-foot">
        {/* Counts the outlines AND the hand-entered cards, so the foot, the stack
            and the "N cards" on the Credit list above all say the same number. The
            header underneath is the one that breaks it down. */}
        {slots.length} {slots.length === 1 ? "card" : "cards"}
        {slots.length > 1 && (
          <>
            {" "}&middot;{" "}
            <button type="button" className="cr-holder-toggle" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? "Show all" : "Collapse"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GuideRow({
  entry, centsFor, shortFor, artFor,
}: {
  entry: GuideEntry;
  centsFor: (productId: string) => number | null;
  /** The short name, for the chips. The winner's line keeps the FULL name: it is
      a sentence naming the member's card and should name it properly, where a
      chip has room for about twenty characters. */
  shortFor: (productId: string) => string;
  artFor: (productId: string) => string | null;
}) {
  const { best } = entry;
  if (!best) return null;
  return (
    <div className="cr-rg-row">
      <div className="cr-rg-ico" aria-hidden="true">{iconFor(entry.categoryId)}</div>
      <div className="cr-rg-body">
        <div className="cr-rg-top">
          <span className="cr-rg-cat">{entry.categoryLabel}</span>
          <span className="cr-rg-rate">{best.display}</span>
          {best.assumesPointValue && <AssumesPointValue cents={centsFor(best.productId)} />}
        </div>
        <div className="cr-rg-card">{best.productName}</div>
        {(best.note || best.cap) && (
          <div className="cr-rg-fine">
            {best.cap && <>Earns that {best.cap}. </>}
            {best.note}
          </div>
        )}
        {(entry.tied.length > 0 || entry.others.length > 0) && (
          <div className="cr-rg-chips">
            {/* A TIE IS A DIFFERENT INSTRUCTION from a winner: it means it does
                not matter which card they reach for. Worth its own emphasis, and
                the reason api/_rewards.ts ties on exact equality only, so a
                0.05% gap stays a winner. */}
            {entry.tied.map((t) => (
              <span className="cr-rg-chip tie" key={t.productId}>
                <CardFace size="sm" brandColor={t.brandColor} artUrl={artFor(t.productId)} />
                Tied with {shortFor(t.productId) || t.productName}
              </span>
            ))}
            {entry.others.map((o) => (
              <span className="cr-rg-chip" key={o.productId}>
                <CardFace size="sm" brandColor={o.brandColor} artUrl={artFor(o.productId)} />
                {shortFor(o.productId) || o.productName}, {o.display}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="cr-rg-spend">
        <b>{money0(entry.monthlySpend)}</b>
        a month
      </div>
    </div>
  );
}

export function RewardsGuide({
  data,
  logoFor,
  onIdentify,
  holderStyle = null,
}: {
  data: CardRewards;
  /** The institution mark for a card, resolved by the caller through the same
      chain Connections and the Credit card rows use. */
  logoFor: (c: LinkedCard) => string | null;
  /** Opens the identify picker, which lives in `CardIdentifyPrompt` above this
      component on the page. Threaded rather than duplicated, because a second
      picker mounted here would be a second place the same answer is written. */
  onIdentify: () => void;
  /** Which holder the member chose (migration 0048), or null for the default.
      Threaded from the page rather than read here, so this component stays a
      pure function of its props and the settings picker can render the same
      holder classes for its swatches without a provider in between. */
  holderStyle?: HolderStyle | null;
}) {
  const confirmed = data.cards.filter((c) => c.product);
  if (!confirmed.length) return null;

  // NO BALANCE AND NO UTILIZATION IN THIS HERO, and that is the point of it.
  // The "Credit cards" card above already owns both: it counts only cards that
  // report a limit and states how many it excluded for not reporting one. A
  // second total here would be a second answer to the same question, computed
  // over a different set (identified cards only), so the two would disagree for
  // any member with an unidentified card and neither would be wrong. The stat row
  // below states only what nothing else on the page states.
  const currency = confirmed[0].currency;
  const benefits = data.benefits;
  const cents = pointValueMap(data);
  const centsFor = (productId: string) => cents.get(productId) ?? null;
  const faces = faceInfoMap(data);
  const shortFor = (productId: string) => faces.get(productId)?.shortName ?? "";
  const artFor = (productId: string) => faces.get(productId)?.artUrl ?? null;
  const totalGain = data.switches.reduce((a, s) => a + s.gain, 0);
  const handCount = (data.manual ?? []).length;

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
      <div className="cr-hero">
        <CardWallet
          cards={confirmed}
          unidentified={data.unidentified}
          manual={data.manual ?? []}
          logoFor={logoFor}
          onIdentify={onIdentify}
          holderStyle={holderStyle}
        />
        <div className="cr-hero-f">
          <div className="eyebrow">Your cards</div>
          {/* "N of M identified" used to describe the whole stack. It cannot any
              more: a hand-entered card can never be identified, so counting it in
              M would leave a total that never completes, and leaving it out
              contradicts the pocket beside it. The count is therefore about LINKED
              cards, said so, with the hand-entered ones named separately. */}
          <div className="cr-hero-sub">
            {confirmed.length} of {data.cards.length}{" "}
            {data.cards.length === 1 ? "linked card" : "linked cards"} identified
            {data.unidentified.length > 0 && <>, {data.unidentified.length} still to go</>}
            {handCount > 0 && <> · {handCount} added by hand</>}
          </div>
          <div className="cr-hero-stats">
            {benefits && benefits.total > 0 && (
              <div className="cr-hero-st">
                <div className="k">Benefits</div>
                <div className="v tnum">{benefits.total}</div>
              </div>
            )}
            {benefits && benefits.unusedValue > 0 && (
              <div className="cr-hero-st">
                <div className="k">Unused credits</div>
                <div className="v tnum">
                  {money0(benefits.unusedValue, currency)}
                  {benefits.valuePartial && <span className="cr-hero-plus" title="Some benefits have no dollar figure, so this total is partial.">+</span>}
                </div>
              </div>
            )}
            {totalGain > 0 && (
              <div className="cr-hero-st">
                <div className="k">Left on the table</div>
                <div className="v tnum">
                  {money0(totalGain, currency)}
                  <span className="cr-hero-per">/yr</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {data.guide.length === 0 ? (
        // Not an error and not empty-looking by accident: a member with a
        // confirmed card and no transaction feed yet genuinely has no spend to
        // order a guide by, and saying so beats an empty box or a table of
        // categories they do not spend in.
        <div className="cr-rg-empty">
          <h3>Nothing to compare yet</h3>
          <p>
            The guide ranks your cards in the categories you actually spend in, so it needs a few weeks of
            transactions first. Your rates are already loaded and will appear here as spending lands.
          </p>
        </div>
      ) : (
        <>
          <div className="card-head">
            <h3>Rewards earning guide</h3>
            <span className="cr-rg-head">Your spend, largest first</span>
          </div>
          <div className="cr-rg-intro">
            Which of your cards is best in each category, ordered by what you actually spend, so the row
            that matters most to you is first.
          </div>
          {data.guide.map((e) => (
            <GuideRow entry={e} centsFor={centsFor} shortFor={shortFor} artFor={artFor}
              key={e.categoryId} />
          ))}
        </>
      )}

      <RewardsProvenance
        asOf={data.provenance.asOf}
        anyUnverified={data.provenance.anyUnverified}
        assumesPointValue={data.provenance.assumesPointValue}
      />
    </div>
  );
}
