import { Link } from "wouter";
import { PageHeader } from "@/components/juniper/app-frame";
import type { FactorKey, ScoreFactor, ScoreImprovement } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { MiniRing, PlanSpark, PlanIcon, cssVar } from "@/components/juniper/primitives";
import {
  useMemberPlans,
  planShape,
  planColor,
  planTitle,
  domainFromName,
  SHAPE_ICON,
  type Plan,
  type PlanShape,
} from "@/lib/plans";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// factor status -> the credit page's colored chip classes (green / amber / red).
const chip: Record<ScoreFactor["status"], { cls: string; label: string; bar: string }> = {
  strong: { cls: "exc", label: "Strong", bar: "var(--jnpr-good)" },
  fair: { cls: "fair", label: "Fair", bar: "var(--jnpr-warn)" },
  weak: { cls: "fair", label: "Needs work", bar: "var(--jnpr-bad)" },
};

/* ------------------------------------------------------------------ *
 * A "way to improve" -> the member's own plan.
 *
 * The score itself has always been real, computed from linked balances. This
 * column was not: it looked each lever up in the demo household's five seeded
 * plans, so a member who has never made a plan read `Work on "Pay off student
 * loans"` in a stranger's color, under a number computed from their own money.
 * The score engine's `planIcon` field existed only to feed that lookup and is
 * gone with it.
 *
 * This table replaces it, and it is the ONE place this page decides what "a plan
 * for this" means. Two halves per factor:
 *
 *   match: which of the member's REAL plans counts as already working the lever.
 *     `shape` is Stage 3's own framing (save / buy / payoff) read off each plan
 *     with `planShape`, so a row written before `goal.shape` existed is
 *     classified by the same `suggestShape` keywords the rest of the app uses,
 *     and there is no second matching scheme to drift out of step. The shape is
 *     STATED here rather than guessed from the factor's own wording, for the
 *     reason GOAL_ROUTES states its shapes on the Plans page: a guess that falls
 *     through to the "save" default mismatches silently. `words` narrows within
 *     a shape, checked against the plan's own text (title, headline, key), and
 *     omitting it means every plan of that shape qualifies. Deliberately
 *     narrower than SHAPE_KEYWORDS: "fund" on its own would let a baby fund
 *     answer for an emergency fund.
 *   offer: what the row does when they have no such plan. `template` names a
 *     template on the Plans page and the row deep-links into it, because that
 *     create flow is the only create flow and this page is not growing a second
 *     one. `template: null` means no plan shape holds the lever honestly, so the
 *     row hands it to the planner instead, the same call the Plans page makes for
 *     a signup goal like "increase my income".
 *
 * Either way nothing is fabricated: an unmatched row keeps its neutral tile and
 * its point value, and borrows no plan's title, color or icon.
 * ------------------------------------------------------------------ */

type FactorRoute = {
  shape: PlanShape | null;
  words?: string[];
  template: string | null;
  cta: string;
};

const FACTOR_ROUTES: Record<FactorKey, FactorRoute> = {
  // A savings RATE has nothing to save toward, nothing to buy and no balance to
  // clear, so all three shapes are fictions and no plan is claimed. A member
  // saving 8% of their income is not "working on it" because they have a home
  // plan, and their home plan is not the thing that would fix the rate.
  savings: { shape: null, template: null, cta: "Ask Juniper where to start" },
  emergency: {
    shape: "save", words: ["emergency", "rainy day", "safety net"],
    template: "Emergency fund", cta: "Start an emergency fund plan",
  },
  // Any payoff plan qualifies. This factor weighs total debt against income, so
  // clearing any balance moves it, and no word list is needed to tell a real
  // match from a hijacked one.
  debt: { shape: "payoff", template: "Pay off debt", cta: "Start a debt payoff plan" },
  investing: {
    shape: "save", words: ["invest", "retire", "401", "brokerage"],
    template: "Invest for retirement", cta: "Start an investing plan",
  },
  // Clearing a card lifts utilization, which IS this lever, so a card payoff
  // plan is a genuine match here and can legitimately answer for both this
  // factor and debt load. Without one the lever is habits (pay on time, stay
  // under 30% of the limit), which no target-and-date plan holds, so there is
  // nothing to offer creating.
  credit: {
    shape: "payoff", words: ["card", "credit"],
    template: null, cta: "Ask Juniper where to start",
  },
};

// A factor key this table has never heard of, which is reachable: the score
// arrives from the server, so an engine a deploy ahead of this bundle can name a
// sixth factor. It renders as a lever with no plan and no create offer, handed
// to the planner, which can take any question. Silently dropping the row would
// hide a real weak spot.
const UNKNOWN_FACTOR: FactorRoute = { shape: null, template: null, cta: "Ask Juniper where to start" };

const routeFor = (factor: FactorKey): FactorRoute => FACTOR_ROUTES[factor] ?? UNKNOWN_FACTOR;

// The member's own plan for a factor, or null when they have none. Completed
// plans are skipped: "work on" a goal they already finished is not a next step.
// Plans arrive newest-touched first (/api/plans orders by updated_at), so when
// two qualify the row points at the one they are actually working in.
function planForFactor(factor: FactorKey, plans: Plan[]): Plan | null {
  const route = routeFor(factor);
  if (!route.shape) return null;
  return (
    plans.find((p) => {
      if (p.status === "completed") return false;
      if (planShape(p) !== route.shape) return false;
      if (!route.words) return true;
      const hay = [planTitle(p), p.goal?.headline ?? "", p.domain].join(" ").toLowerCase();
      return route.words.some((w) => hay.includes(w));
    }) ?? null
  );
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
  const { plans, loading } = useMemberPlans();
  if (!items.length) {
    return <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>You're firing on all cylinders, no weak spots to shore up right now.</div>;
  }
  return (
    <div className="plans-col">
      {items.map((im) => {
        const route = routeFor(im.factor);
        // No guess while the plans are still in flight. Offering to start a plan
        // and then swapping the line for "work on the one you have" reads as a
        // bug, and one half of that pair is wrong either way, so the lever
        // renders immediately and its action waits for the real answer.
        const plan = loading ? null : planForFactor(im.factor, plans);
        return (
          <div className="plan-row" key={im.factor} style={{ cursor: "default" }}>
            <div className="track" style={{ background: plan ? cssVar(planColor(plan)) : "var(--jnpr-accent)" }}>
              {plan ? <PlanIcon name={SHAPE_ICON[planShape(plan)]} /> : <span>{im.potentialPts}</span>}
            </div>
            <div className="pr-body">
              <div className="pr-top">
                <span className="pt">{im.title}</span>
                <span className="amt tnum" style={{ color: "var(--jnpr-good)" }}>+{im.potentialPts} pts</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--jnpr-ink-3)", margin: "4px 0 2px" }}>{im.detail}</div>
              {loading ? null : plan ? (
                <Link href="/app/plans" className="link">Work on “{planTitle(plan)}” →</Link>
              ) : route.template ? (
                // Straight into the Plans page's create modal, on the template
                // this lever needs. Slugged through `domainFromName` so both
                // ends of the link share the one normalizer.
                <Link href={`/app/plans?new=${domainFromName(route.template)}`} className="link">{route.cta} →</Link>
              ) : (
                // No `plan=` param: there is no plan to scope the chat to, and
                // passing one would have Ask claim a grounding it does not have.
                <Link href={`/app/ask?q=${encodeURIComponent(`${im.title}. Where should I start?`)}`} className="link">{route.cta} →</Link>
              )}
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
