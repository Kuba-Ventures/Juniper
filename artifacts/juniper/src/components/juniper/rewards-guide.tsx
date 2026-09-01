import { useState } from "react";
import { CardFace, AssumesPointValue, RewardsProvenance } from "@/components/juniper/card-rewards-bits";
import { faceInfoMap, money0, pointValueMap, type CardRewards, type GuideEntry, type LinkedCard } from "@/lib/cards";

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
const REVEAL = 54;   // matches `--cr-reveal` in juniper.css
const FACE_H = 124;  // matches `.cr-face-lg` height

function CardWallet({
  cards,
  unidentified,
  logoFor,
  onIdentify,
}: {
  cards: LinkedCard[];
  /** Cards still to be named, drawn as labelled outlines after the real ones. */
  unidentified: CardRewards["unidentified"];
  logoFor: (c: LinkedCard) => string | null;
  /** Opens the identify picker. See the note in the docblock about why an
      outline that does nothing would be worse than no outline at all. */
  onIdentify: () => void;
}) {
  const withProduct = cards.filter((c) => c.product);
  const [collapsed, setCollapsed] = useState(false);
  // Which card is pulled to the front. Null means the natural order stands.
  const [front, setFront] = useState<string | null>(null);
  if (!withProduct.length) return null;

  // ONE list, confirmed first and outlines last, so the pocket's count and the
  // header's "N of M identified" describe the same set. See the docblock: a
  // header saying three over a stack of two reads as a card having gone missing.
  const slots: { key: string; card: LinkedCard | null; label: string; mask: string | null;
                 issuer: string }[] = [
    ...withProduct.map((c) => ({
      key: c.plaid_account_id, card: c, issuer: c.institution,
      label: c.product?.short_name ?? c.account_name, mask: c.mask,
    })),
    ...unidentified.map((u) => ({
      // Prefixed: an unidentified card's `plaid_account_id` is in the same
      // namespace as a confirmed one's, and the two lists are disjoint today, but
      // a key collision here would silently drop a face rather than error.
      key: `unk:${u.plaid_account_id}`, card: null, issuer: u.institution,
      label: "Which card?", mask: u.mask,
    })),
  ];

  // Every card, not the first four: vertical reveal is the whole reason this
  // layout was chosen, so capping it would throw away the property it was picked
  // for. Collapsed shows the top three edges and a count.
  const shown = collapsed ? slots.slice(0, 3) : slots;
  const height = collapsed
    ? REVEAL * (shown.length - 1) + 40
    : REVEAL * (shown.length - 1) + FACE_H + 58;

  return (
    <div className="cr-pocket" style={{ height }}>
      {shown.map((s, i) => {
        const c = s.card;
        const raised = front === s.key;
        return (
          <button
            type="button"
            key={s.key}
            className={raised ? "cr-pocket-card up" : "cr-pocket-card"}
            style={{ top: i * REVEAL, zIndex: (i + 1) * 10 }}
            // The outline says what tapping it DOES, because unlike a real card
            // it is not a thing to look at, it is a thing to act on.
            aria-label={c ? `${s.issuer} ${s.label}` : `Identify your ${s.issuer} card`}
            // A raise is a toggle and an identify is not, so only the real cards
            // claim a pressed state. Reporting one on the outline would announce
            // a toggle that does not exist.
            aria-pressed={c ? raised : undefined}
            onClick={() => { if (c) setFront(raised ? null : s.key); else onIdentify(); }}
          >
            <CardFace
              size="lg"
              layout="strip"
              issuer={s.issuer}
              // `unknown` draws the outline and `label` names it. The pair is the
              // same one the identify prompt itself uses, so the two surfaces
              // cannot describe the same state differently.
              unknown={!c}
              productName={c ? s.label : undefined}
              label={c ? undefined : s.label}
              mask={s.mask}
              brandColor={c?.product?.brand_color}
              artUrl={c?.product?.art_url}
              logoSrc={c ? logoFor(c) : null}
            />
          </button>
        );
      })}
      {/* The lip, over the front card. Purely decorative, so it must not eat the
          taps meant for the cards behind it. */}
      <div className="cr-pocket-lip" aria-hidden="true" />
      <div className="cr-pocket-foot">
        {/* Counts the OUTLINES too, so the foot, the stack and the header above
            all say the same number. The header is the one that says how many of
            them are still to be named. */}
        {slots.length} {slots.length === 1 ? "card" : "cards"}
        {slots.length > 3 && (
          <>
            {" "}&middot;{" "}
            <button type="button" className="cr-pocket-toggle" onClick={() => setCollapsed((v) => !v)}>
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
}: {
  data: CardRewards;
  /** The institution mark for a card, resolved by the caller through the same
      chain Connections and the Credit card rows use. */
  logoFor: (c: LinkedCard) => string | null;
  /** Opens the identify picker, which lives in `CardIdentifyPrompt` above this
      component on the page. Threaded rather than duplicated, because a second
      picker mounted here would be a second place the same answer is written. */
  onIdentify: () => void;
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

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
      <div className="cr-hero">
        <CardWallet
          cards={confirmed}
          unidentified={data.unidentified}
          logoFor={logoFor}
          onIdentify={onIdentify}
        />
        <div className="cr-hero-f">
          <div className="eyebrow">Your cards</div>
          <div className="cr-hero-sub">
            {confirmed.length} of {data.cards.length}{" "}
            {data.cards.length === 1 ? "card" : "cards"} identified
            {data.unidentified.length > 0 && <>, {data.unidentified.length} still to go</>}
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
