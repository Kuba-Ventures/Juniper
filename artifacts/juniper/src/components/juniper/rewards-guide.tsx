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
// print alongside it. That shape is genuinely good and the screenshots on #168
// are why.
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
//
// A row shows the WINNER ONLY now, with a real card photo, and the rate as its
// own hero-weight number beside the $/month figure it already had. The "tied
// with" / "also considered" chips are gone: Finley asked not to see 2nd and 3rd
// place, and for the rate to read louder than the plain accent-colored text it
// used to be (previews/rewards-guide-photo-options.html, then
// rewards-guide-rate-emphasis-options.html, option E). `entry.tied` and
// `entry.others` are still computed server-side and simply unused here, so
// nothing about api/_rewards.ts or the guide's ranking changed.

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

// `best.display` is always "<multiplier><%|x> <currency word>" (api/_rewards.ts
// `displayRate`), exactly one space between the rate token and its unit, so the
// hero-column treatment below can split on the first space rather than
// reformatting the number itself.
function splitRate(display: string): [string, string] {
  const i = display.indexOf(" ");
  return i === -1 ? [display, ""] : [display.slice(0, i), display.slice(i + 1)];
}

function GuideRow({
  entry, centsFor, artFor,
}: {
  entry: GuideEntry;
  centsFor: (productId: string) => number | null;
  artFor: (productId: string) => string | null;
}) {
  const { best } = entry;
  if (!best) return null;
  const [rateNum, rateLabel] = splitRate(best.display);
  return (
    <div className="cr-rg-row">
      <div className="cr-rg-id">
        <div className="cr-rg-ico" aria-hidden="true">{iconFor(entry.categoryId)}</div>
        <CardFace size="sm" brandColor={best.brandColor} artUrl={artFor(best.productId)} />
        <div className="cr-rg-idbody">
          {/* Category as the small label, card name as the answer underneath it --
              the redesign for issue #264. The rate used to live on this line too;
              it now has its own hero-weight column (see below), so this line is
              just the instruction: which card. */}
          <div className="cr-rg-best">Best {entry.categoryLabel}</div>
          <div className="cr-rg-winner">
            {best.productName}
            {best.assumesPointValue && <AssumesPointValue cents={centsFor(best.productId)} />}
          </div>
          {(best.note || best.cap) && (
            <div className="cr-rg-fine">
              {best.cap && <>Earns that {best.cap}. </>}
              {best.note}
            </div>
          )}
        </div>
      </div>
      <div className="cr-rg-rate-col">
        <div className="cr-rg-rate-num tnum">{rateNum}</div>
        <div className="cr-rg-rate-lab">{rateLabel}</div>
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
            <GuideRow entry={e} centsFor={centsFor} artFor={artFor}
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

// The benefits-and-switches summary that used to render here as its own card
// (RewardsSummaryCharts) is now BenefitsTracker's own head band in
// benefits-tracker.tsx -- the two cards read as plain and repetitive stacked
// back to back, and stating "X of 12" here and "12 benefits from 3 cards" a
// few pixels below it was the same number said twice. Three live options in
// previews/benefits-merge-options.html, option A chosen.
