import { CardFace, AssumesPointValue, RewardsProvenance } from "@/components/juniper/card-rewards-bits";
import { money0, pointValueMap, type CardRewards, type GuideEntry, type LinkedCard } from "@/lib/cards";

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
 * The stack of card faces.
 *
 * Only CONFIRMED cards are drawn. An unidentified card has no brand colour to
 * borrow, and putting an outline in the fan would read as a rendering fault
 * rather than as a card waiting to be named, which is what the identify prompt
 * above it is for.
 */
function CardStack({ cards, logoFor }: { cards: LinkedCard[]; logoFor: (c: LinkedCard) => string | null }) {
  const withProduct = cards.filter((c) => c.product);
  if (!withProduct.length) return null;
  // Capped at four. The fan offsets are fixed in CSS, and a fifth card would
  // either extend past the stack's declared width or need a second offset scale
  // for a case almost nobody is in.
  const shown = withProduct.slice(0, 4);
  return (
    <div className="cr-stack" style={{ width: 172 + (shown.length - 1) * 26 }}>
      {shown.map((c) => (
        <CardFace
          key={c.plaid_account_id}
          size="lg"
          issuer={c.institution}
          productName={c.product?.name}
          mask={c.mask}
          brandColor={c.product?.brand_color}
          logoSrc={logoFor(c)}
        />
      ))}
    </div>
  );
}

function GuideRow({ entry, centsFor }: { entry: GuideEntry; centsFor: (productId: string) => number | null }) {
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
                <CardFace size="sm" brandColor={t.brandColor} />
                Tied with {t.productName}
              </span>
            ))}
            {entry.others.map((o) => (
              <span className="cr-rg-chip" key={o.productId}>
                <CardFace size="sm" brandColor={o.brandColor} />
                {o.productName}, {o.display}
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
}: {
  data: CardRewards;
  /** The institution mark for a card, resolved by the caller through the same
      chain Connections and the Credit card rows use. */
  logoFor: (c: LinkedCard) => string | null;
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
  const totalGain = data.switches.reduce((a, s) => a + s.gain, 0);

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
      <div className="cr-hero">
        <CardStack cards={confirmed} logoFor={logoFor} />
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
          {data.guide.map((e) => <GuideRow entry={e} centsFor={centsFor} key={e.categoryId} />)}
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
