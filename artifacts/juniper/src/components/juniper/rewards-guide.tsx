import { faceInfoMap, money0, pointValueMap, type CardRewards, type GuideEntry } from "@/lib/cards";
import { CardFace, AssumesPointValue, RewardsProvenance } from "@/components/juniper/card-rewards-bits";

// The rewards earning guide. Treatment A of three (design/card-rewards-variants.html),
// issue #168; redesigned to lead with the instruction rather than the rate for
// issue #264 (treatment A of three, previews/credit-guide-benefits-options.html).
//
// The card-art holder this component used to render alongside the guide moved
// out to its own file, card-wallet.tsx, and its own place on the page (issue
// #264 puts the holder second, right after the score panel, ahead of the card
// list; the guide now sits further down, beside the benefits tracker and the
// switch ideas, which is where a member reads it after already knowing what
// each card is). Nothing about the wallet changed, only where it is mounted.
//
// ── WHAT THIS TAKES FROM CREDIT KARMA AND WHAT IT CHANGES ──────────────────
//
// Takes: a per-category list naming which of YOUR cards wins, with the fine
// print and a chip for a tie. That shape is genuinely good and the screenshots
// on #168 are why.
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
        {/* Category as the small label, card and rate as the answer -- the
            instruction reads "Best Dining: Sapphire Preferred, 3x" rather than a
            rate-table row with the card name tucked underneath it. Redesigned for
            issue #264 (treatment A of three, previews/credit-guide-benefits-options.html). */}
        <div className="cr-rg-best">Best {entry.categoryLabel}</div>
        <div className="cr-rg-winner">
          {best.productName}
          <span className="cr-rg-rate">{best.display}</span>
          {best.assumesPointValue && <AssumesPointValue cents={centsFor(best.productId)} />}
        </div>
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

export function RewardsGuide({ data }: { data: CardRewards }) {
  const confirmed = data.cards.filter((c) => c.product);
  if (!confirmed.length) return null;

  const cents = pointValueMap(data);
  const centsFor = (productId: string) => cents.get(productId) ?? null;
  const faces = faceInfoMap(data);
  const shortFor = (productId: string) => faces.get(productId)?.shortName ?? "";
  const artFor = (productId: string) => faces.get(productId)?.artUrl ?? null;

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
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
            The card to reach for in each category, ordered by what you actually spend, so the instruction
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

/**
 * Benefits and what is being left on the table, as a small set of charts rather
 * than the flat count-and-two-dollar-figures tile row this used to be. Issue
 * #264 asks for this section, section 4 on the page, to read as charts; the
 * checklist underneath it (`BenefitsTracker`) stays a list, because a checklist
 * is the one shape a yes/no per-benefit answer can honestly take, but the
 * AGGREGATE of it, how much of what is available has actually been used, is
 * exactly the kind of number a proportion bar states better than a sentence.
 *
 * `benefits.total`/`unusedValue` and `switches` are the same figures the wallet
 * cover and the old rewards hero used to show; this is where they live now that
 * the wallet is its own section higher up the page.
 */
export function RewardsSummaryCharts({ data }: { data: CardRewards }) {
  const confirmed = data.cards.filter((c) => c.product);
  if (!confirmed.length) return null;
  const benefits = data.benefits;
  const currency = confirmed[0].currency;
  const totalGain = data.switches.reduce((a, s) => a + s.gain, 0);
  if (!benefits?.total && !(totalGain > 0)) return null;

  const usedPct = benefits && benefits.total > 0
    ? Math.round((benefits.usedCount / benefits.total) * 100)
    : null;

  return (
    <div className="card pad-lg" style={{ marginBottom: 14 }}>
      <div className="card-head"><h3>Benefits and what you're leaving on the table</h3></div>
      {benefits && benefits.total > 0 && (
        <div className="cr-rc-bar-row">
          <div className="cr-rc-bar-k">Benefits ticked off this period</div>
          <div className="bar"><i style={{ width: `${usedPct}%`, background: "var(--jnpr-accent)" }} /></div>
          <div className="cr-rc-bar-v tnum">{benefits.usedCount} of {benefits.total}</div>
        </div>
      )}
      <div className="cr-hero-stats">
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
  );
}
