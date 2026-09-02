import { Link } from "wouter";
import { money, type FactorKey, type ScoreFactor, type ScoreGauge } from "@/lib/mock-data";

// Shared by the Score page's "What goes into it" card and the Overview Score
// widget's full-size shape (issue #259): one definition of a factor rail, so
// the ring-strip's full breakdown cannot disagree with the page it links to.

// Factor status -> its color. The Strong / Fair / Needs work chip that used to
// sit beside each factor is gone with the sub-score bar: the rail's own fill
// against the target notch says the same thing, and the chip was a third
// restatement of it next to the number and the bar.
export const STATUS_COLOR: Record<ScoreFactor["status"], string> = {
  strong: "var(--jnpr-good)",
  fair: "var(--jnpr-warn)",
  weak: "var(--jnpr-bad)",
};

// Where the target notch sits along the rail, as a percentage of its width. Not
// at 100%: a member past their target has to have somewhere to be drawn, and a
// rail that ends at the target can only ever say "done", never "well past it".
const TARGET_AT = 68;
// How far beyond the target the rail keeps scaling before it just saturates.
// 1.45x the target fills the remaining 32%, so 2.4x annual income invested and
// 1.1x both read as clearly past the notch without one squashing the other.
const OVERSHOOT = 1.45;

const fmtGauge = (n: number, unit: ScoreGauge["unit"]) =>
  unit === "percent" ? `${Math.round(n)}%` : money(Math.round(n));

// One factor's rail: fill is where they are, the notch is the target computed
// from their own income and spending, and for debt the far side is shaded
// because less is better there.
//
// Replaced a 0-100 sub-score bar. That bar was the same shape for every factor
// and said nothing a member could act on: it reported our scoring model back to
// them. This says "you have $1,625 in cash, six months of your spending is
// $5,604", which is the same information the score is built from, in units they
// recognize.
export function FactorRail({ gauge, weak }: { gauge: ScoreGauge; weak: boolean }) {
  const ratio = gauge.target > 0 ? Math.max(0, gauge.now) / gauge.target : 0;
  const fill = Math.min(ratio, OVERSHOOT) * TARGET_AT;
  const good = gauge.invert ? ratio <= 1 : ratio >= 1;
  const color = weak ? STATUS_COLOR.weak : good ? STATUS_COLOR.strong : STATUS_COLOR.fair;
  return (
    <div className="fg">
      <div className={gauge.invert ? "fg-rail inv" : "fg-rail"}>
        {gauge.invert && <span className="fg-over" style={{ left: `${TARGET_AT}%` }} />}
        <i style={{ width: `${fill.toFixed(1)}%`, background: color }} />
        <span className="fg-tick" style={{ left: `${TARGET_AT}%` }} />
      </div>
      <div className="fg-ends">
        <span className="fg-now tnum" style={{ color }}>{fmtGauge(gauge.now, gauge.unit)}</span>
        <span className="fg-u">{gauge.nowNote}</span>
        <span className="fg-tgt tnum">{fmtGauge(gauge.target, gauge.unit)}</span>
        <span className="fg-u">{gauge.targetNote}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Factors the engine could not measure.
 *
 * Since PR #146 an unmeasured factor is DROPPED from the score rather than
 * filled with a plausible number, and the remaining weights renormalize. That
 * is the honest arithmetic, but on its own it is also silent: the factor simply
 * is not there, so a member cannot tell the difference between a part of their
 * financial life Juniper judged fine and one it never saw.
 *
 * These rows say which. Deriving them by difference, rather than having the
 * engine emit placeholder factors, keeps that fix intact: nothing here carries a
 * score, a weight, or a target, because there is no data to give it one.
 *
 * The copy promises MEASUREMENT, never points. Connecting an account can just as
 * easily lower the score as raise it, since it replaces nothing with a real
 * reading, and promising points is the same shape of claim the flat-70 credit
 * factor was making before #146 removed it.
 * ------------------------------------------------------------------ */

type FactorGap = { label: string; why: string; cta: string };

const FACTOR_GAPS: Record<FactorKey, FactorGap> = {
  credit: {
    label: "Credit health",
    why: "Juniper reads this from the credit limits your cards report through Plaid, and none are coming through yet.",
    cta: "Connect a card",
  },
  // The four below cannot go missing today: their factors are always returned,
  // and a member with no income gets a scored factor with a null gauge rather
  // than no factor at all. They are here so that if one ever does start dropping
  // out, it gets a row explaining itself instead of vanishing from the page.
  savings: {
    label: "Savings rate",
    why: "Juniper reads this from the income and spending on your linked accounts.",
    cta: "Connect an account",
  },
  emergency: {
    label: "Emergency fund",
    why: "Juniper reads this from your cash balances against your spending.",
    cta: "Connect an account",
  },
  debt: {
    label: "Debt load",
    why: "Juniper reads this from the balances on your cards and loans.",
    cta: "Connect an account",
  },
  investing: {
    label: "Investing pace",
    why: "Juniper reads this from your brokerage and retirement balances.",
    cta: "Connect an account",
  },
};

const FACTOR_ORDER: FactorKey[] = ["savings", "emergency", "debt", "investing", "credit"];

export function Factors({ items }: { items: ScoreFactor[] }) {
  const measured = new Set(items.map((f) => f.key));
  const gaps = FACTOR_ORDER.filter((k) => !measured.has(k));
  return (
    <div>
      {items.map((f) => (
        <div className="fg-row" key={f.key}>
          <div className="fg-top">
            <span className="fg-lab">{f.label}</span>
            <span className="fg-w">{Math.round(f.weight * 100)}% of score</span>
            <span className="fg-sc tnum" style={{ color: STATUS_COLOR[f.status] }}>{f.score}</span>
          </div>
          {f.gauge ? (
            <FactorRail gauge={f.gauge} weak={f.status === "weak"} />
          ) : (
            // No target to draw against, so the sentence carries the row on its
            // own rather than a rail with an invented scale. Today this is only
            // the credit factor on a member whose score came from a bureau.
            <div className="fg-detail">{f.detail}</div>
          )}
        </div>
      ))}

      {gaps.map((key) => {
        const gap = FACTOR_GAPS[key];
        return (
          <div className="fg-row gap" key={key}>
            <div className="fg-top">
              <span className="fg-lab">{gap.label}</span>
              <span className="fg-w">not counted</span>
            </div>
            {/* An empty rail with no notch, because there is no target: a target
                needs a measurement to sit against. It reads as the shape of the
                other rows with nothing in it, which is exactly the situation. */}
            <div className="fg-rail empty" />
            <div className="fg-gap-foot">
              <p>{gap.why}</p>
              <Link href="/app/connections" className="btn ghost sm">{gap.cta}</Link>
            </div>
          </div>
        );
      })}

      {gaps.length > 0 && (
        <p className="fg-note">
          Your score is built from the {items.length} {items.length === 1 ? "factor" : "factors"} above.
          Adding {gaps.length === 1 ? "the missing one" : "the missing ones"} may read higher or lower than
          where you stand today.
        </p>
      )}
    </div>
  );
}
