import { Link } from "wouter";
import { PageHeader } from "@/components/juniper/app-frame";
import { plans, type ScoreFactor, type ScoreImprovement } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { MiniRing, PlanSpark, planMark, cssVar } from "@/components/juniper/primitives";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// factor status -> the credit page's colored chip classes (green / amber / red).
const chip: Record<ScoreFactor["status"], { cls: string; label: string; bar: string }> = {
  strong: { cls: "exc", label: "Strong", bar: "var(--jnpr-good)" },
  fair: { cls: "fair", label: "Fair", bar: "var(--jnpr-warn)" },
  weak: { cls: "fair", label: "Needs work", bar: "var(--jnpr-bad)" },
};

// Cross-link a "way to improve" to the matching plan, if the user has one.
function planFor(icon: string | null) {
  if (!icon) return null;
  return plans.find((p) => p.icon === icon && !p.done) ?? null;
}

function Factors({ items }: { items: ScoreFactor[] }) {
  return (
    <div>
      {items.map((f) => {
        const c = chip[f.status];
        return (
          <div className="bud" key={f.key}>
            <div className="t">
              <span>{f.label} <span style={{ color: "var(--jnpr-ink-3)", fontWeight: 550 }}>· {Math.round(f.weight * 100)}% of score</span></span>
              <span className={`cr ${c.cls}`} style={f.status === "weak" ? { color: "var(--jnpr-bad)", background: "var(--jnpr-bad-soft)" } : undefined}>{c.label}</span>
            </div>
            <div className="bar"><i style={{ width: `${f.score}%`, background: c.bar }} /></div>
            <div style={{ fontSize: 12, color: "var(--jnpr-ink-3)", marginTop: 6 }}>{f.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

function Improvements({ items }: { items: ScoreImprovement[] }) {
  if (!items.length) {
    return <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>You're firing on all cylinders, no weak spots to shore up right now.</div>;
  }
  return (
    <div className="plans-col">
      {items.map((im, i) => {
        const plan = planFor(im.planIcon);
        return (
          <div className="plan-row" key={i} style={{ cursor: "default" }}>
            <div className="track" style={{ background: plan ? cssVar(plan.k) : "var(--jnpr-accent)" }}>
              {plan ? planMark(plan) : <span>{im.potentialPts}</span>}
            </div>
            <div className="pr-body">
              <div className="pr-top">
                <span className="pt">{im.title}</span>
                <span className="amt tnum" style={{ color: "var(--jnpr-good)" }}>+{im.potentialPts} pts</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--jnpr-ink-3)", margin: "4px 0 2px" }}>{im.detail}</div>
              {plan
                ? <Link href="/app/plans" className="link">Work on “{plan.t}” →</Link>
                : <Link href="/app/plans" className="link">Start a plan for this →</Link>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Score() {
  const { data } = useFinances();
  const score = data.score;
  return (
    <div className="frame">
      <PageHeader
        title="Juniper Score"
        sub="Your all-in financial health from 0 to 100, savings, safety net, debt, investing, and credit in one number, with the highest-leverage moves to raise it."
        actions={<span className="plaid-pill"><span className="dot" />Updated today</span>}
      />

      <div className="card pad-lg" style={{ marginBottom: 16 }}>
        <div className="credit-hero">
          <div>
            <div className="eyebrow">Your Juniper Score</div>
            <div className="credit-num">
              <span className="big tnum">{score.value}</span>
              {score.delta !== 0 && (
                <span className={`delta ${score.delta > 0 ? "up" : "down"}`}>
                  {score.delta > 0 ? <UpArrow /> : null}{score.delta > 0 ? "+" : ""}{score.delta} pts this month
                </span>
              )}
            </div>
            <div className="credit-band-lg">{score.band}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
              <MiniRing score={score.value} d={54} />
              <p className="disc" style={{ margin: 0 }}>
                Proprietary to Juniper, not a credit score. Built from your linked accounts and updated as your money moves. Biggest lever right now: <b>{score.lever}</b>.
              </p>
            </div>
          </div>
          <div className="score-trend">
            <div className="st-head">
              <span className="eyebrow">Score · last {score.trend.length} months</span>
              <span className={`delta ${score.delta >= 0 ? "up" : "down"}`}>{score.delta >= 0 ? "+" : ""}{score.delta}</span>
            </div>
            <PlanSpark data={score.trend} k="--jnpr-accent" height={96} />
            <div className="st-foot">
              <span>{score.trend[0]} · {score.trend.length} mo ago</span>
              <span><b className="tnum">{score.value}</b> · now</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h3>What goes into it</h3></div>
          <Factors items={score.factors} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Ways to improve</h3><span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>Ranked by impact</span></div>
          <Improvements items={score.improvements} />
        </div>
      </div>
    </div>
  );
}
