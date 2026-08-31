import { CardFace, AssumesPointValue } from "@/components/juniper/card-rewards-bits";
import { money0, pointValueMap, type CardRewards, type SwitchIdea, type UpgradeIdea } from "@/lib/cards";

// "Worth switching" and "Cards that would beat yours". Treatment A of three
// (design/card-rewards-variants.html), issue #168.
//
// ── TWO KINDS OF RECOMMENDATION, AND ONLY ONE OF THEM IS AN OFFER ───────────
//
// **Worth switching** compares cards the member ALREADY HOLDS. Both rates have a
// source, the spend is their own, and acting on it costs them nothing: no
// application, no hard pull, no affiliate link, and therefore none of the
// compliance work that gates the marketplace. This is the recommendation worth
// leading with and it is the one the issue's "maybe a better gas, travel or
// everyday rewards" is really asking for, answered from what they have.
//
// **Cards that would beat yours** names catalog cards they do not hold, and
// CARRIES NO LINK, deliberately. Every affiliate URL in this product is still a
// placeholder until approved programs and category-specific credit disclosures
// clear (ROADMAP Stage 5, the compliance note in migration 0010), and a credit
// card application is the category where that matters most: `docs/CREDIT_PROVIDER.md`
// section 4 records that a paid credit-offer marketplace is the "with respect to
// the extension of credit by others" element of the credit-services statutes,
// which in California alone means DOJ registration and a $100,000 bond. So this
// names the card, shows the arithmetic, and stops. `UpgradeIdea` has nowhere to
// put a URL, which is asserted by scripts/src/check-rewards.ts so a later change
// cannot quietly add one.
//
// The annual fee is subtracted before a card is named at all. A card earning
// $180 more a year on a $250 fee is a WORSE card, and showing the $180 alone
// would be the most expensive half-truth on this page.

function SwitchRow({
  idea,
  brandColorOf,
  centsFor,
}: {
  idea: SwitchIdea;
  brandColorOf: (productId: string) => string | null;
  centsFor: (productId: string) => number | null;
}) {
  return (
    <div className="cr-sw">
      <CardFace size="md" productName={idea.from.productName} brandColor={brandColorOf(idea.from.productId)} />
      <span className="cr-sw-arrow" aria-hidden="true">→</span>
      <CardFace size="md" productName={idea.to.productName} brandColor={brandColorOf(idea.to.productId)} />
      <div className="cr-sw-body">
        <div className="cr-sw-h">
          Put {idea.categoryLabel.toLowerCase()} on the {idea.to.productName}
        </div>
        <div className="cr-sw-d">
          You put {money0(idea.annualSpend / 12)} a month of {idea.categoryLabel.toLowerCase()} on the{" "}
          {idea.from.productName} at {idea.from.display}. The {idea.to.productName} earns{" "}
          {idea.to.display} there.
          {idea.to.cap && <> It earns that {idea.to.cap}.</>}
          {idea.to.note && <> {idea.to.note}</>}
          {idea.assumesPointValue && <> <AssumesPointValue cents={centsFor(idea.to.productId) ?? centsFor(idea.from.productId)} /></>}
        </div>
      </div>
      <div className="cr-sw-gain">
        +{money0(idea.gain)}
        <span>a year</span>
      </div>
    </div>
  );
}

function UpgradeRow({ idea, centsFor }: { idea: UpgradeIdea; centsFor: (productId: string) => number | null }) {
  const top = idea.wins.slice(0, 3);
  return (
    <div className="cr-sw">
      <CardFace size="md" unknown label={idea.issuer} />
      <div className="cr-sw-body">
        <div className="cr-sw-h">{idea.productName}</div>
        <div className="cr-sw-d">
          Would earn more on{" "}
          {top.map((w, i) => (
            <span key={w.categoryId}>
              {i > 0 && (i === top.length - 1 ? " and " : ", ")}
              {w.categoryLabel.toLowerCase()} ({w.display})
            </span>
          ))}
          {idea.wins.length > top.length && <> and {idea.wins.length - top.length} more</>}.
          {/* Both numbers, always, and never the gross alone. */}
          {idea.annualFee > 0
            ? <> {money0(idea.grossGain)} a year more than your current cards, less the{" "}
                {money0(idea.annualFee)} annual fee.</>
            : <> {money0(idea.grossGain)} a year more than your current cards, with no annual fee.</>}
          {idea.assumesPointValue && <> <AssumesPointValue cents={centsFor(idea.productId)} /></>}
        </div>
      </div>
      <div className="cr-sw-gain">
        +{money0(idea.netGain)}
        <span>a year, net</span>
      </div>
    </div>
  );
}

export function CardSwitches({ data }: { data: CardRewards }) {
  const brandColorOf = (productId: string): string | null =>
    data.cards.find((c) => c.product?.id === productId)?.product?.brand_color ?? null;
  const cents = pointValueMap(data);
  const centsFor = (productId: string) => cents.get(productId) ?? null;

  const hasSwitches = data.switches.length > 0;
  const hasUpgrades = data.upgrades.length > 0;
  if (!hasSwitches && !hasUpgrades) return null;

  const totalGain = data.switches.reduce((a, s) => a + s.gain, 0);

  return (
    <>
      {hasSwitches && (
        <div className="card pad-lg" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>Worth switching</h3>
            <span className="cr-sw-total">{money0(totalGain)} a year</span>
          </div>
          {data.switches.map((s) => (
            <SwitchRow idea={s} brandColorOf={brandColorOf} centsFor={centsFor}
              key={`${s.categoryId}-${s.from.productId}`} />
          ))}
          <div className="cr-prov">
            Both cards are already yours, so there is nothing to apply for and no credit check. Figures come
            from your own spending over the last few months, annualized, and honour each card's own caps.
          </div>
        </div>
      )}

      {hasUpgrades && (
        <div className="card pad-lg" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h3>Cards that would beat yours</h3>
            <span className="cr-rg-head">On your own spending</span>
          </div>
          {data.upgrades.map((u) => <UpgradeRow idea={u} centsFor={centsFor} key={u.productId} />)}
          <div className="cr-prov">
            Juniper is not offering these and there is nothing to click. It has no affiliate relationship
            with any card issuer, so this names what the arithmetic says and leaves the decision with you.
            Applying for a card means a hard credit check and a permanent new line on your report, neither of
            which is counted above.
          </div>
        </div>
      )}
    </>
  );
}
