import { Link } from "wouter";
import { PageHeader } from "@/components/juniper/app-frame";
import { type ScoreImprovement } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { MiniRing, PlanSpark, PlanIcon, cssVar, SCORE_DASH } from "@/components/juniper/primitives";
import { Factors } from "@/components/juniper/score-factors";
import { routeFor, planForFactor } from "@/lib/score-levers";
import {
  useMemberPlans,
  planShape,
  planColor,
  planTitle,
  domainFromName,
  SHAPE_ICON,
} from "@/lib/plans";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// The "way to improve" -> member's-own-plan matching (FACTOR_ROUTES,
// routeFor, planForFactor) moved to lib/score-levers.ts (issue #290/#407): the
// Overview's "Score levers" widget needs the same "already have a plan for
// this" check this page's own Ways-to-improve column makes, and two
// definitions of it is exactly how they'd disagree about whether a member is
// already working a lever.

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
  const { data, scorePending } = useFinances();
  const score = data.score;
  // Points still on the table, the same figure the Ways to improve column ranks
  // by, totalled once so the factor list opens with the size of the opportunity
  // instead of leaving it to be added up row by row.
  const headroom = score.improvements.reduce((a, im) => a + im.potentialPts, 0);
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
            {/* WITHHELD, NOT ZEROED, until the server has answered. The score is
                derived, and the manual layer derives it from different inputs than
                the live one, so this drew a profile-derived number for a moment
                before the live one replaced it. See `scorePending` in
                lib/finances.ts. The delta goes with it: a change measured against
                a number we are not showing is not a fact about anything. */}
            <div className="credit-num">
              <span className={scorePending ? "big tnum pending" : "big tnum"}>
                {scorePending ? SCORE_DASH : score.value}
              </span>
              {!scorePending && score.delta !== 0 && (
                <span className={`delta ${score.delta > 0 ? "up" : "down"}`}>
                  {score.delta > 0 ? <UpArrow /> : null}{score.delta > 0 ? "+" : ""}{score.delta} pts this month
                </span>
              )}
            </div>
            <div className="credit-band-lg">
              {scorePending ? <span className="pending">Working out your score…</span> : score.band}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
              <MiniRing score={score.value} d={54} pending={scorePending} />
              <p className="disc" style={{ margin: 0 }}>
                Proprietary to Juniper, not a credit score. Built from your linked accounts and updated as your money moves.
                {/* The CLAUSE stays and only its value is withheld, so the paragraph
                    keeps its line count and the card does not grow by a line when
                    the real lever arrives. Dropping the clause entirely settled 8px
                    taller, which is a small jump on the number this page is about. */}
                {" "}Biggest lever right now: <b className={scorePending ? "pending" : undefined}>
                  {scorePending ? SCORE_DASH : score.lever}
                </b>.
              </p>
            </div>
          </div>
          <div className="score-trend">
            <div className="st-head">
              <span className="eyebrow">Score · last {score.trend.length} months</span>
              {/* The chip KEEPS ITS PLACE while pending rather than being removed.
                  It is the tallest thing in this head, so dropping it settled the
                  whole card 8px shorter and then grew it back the moment the score
                  arrived, which is the jump this change exists to remove. A dash
                  states no delta; an absent chip states no delta either, and costs
                  a reflow. Measured: .st-head 17px without it, 24px with. */}
              <span className={scorePending ? "delta pending" : `delta ${score.delta >= 0 ? "up" : "down"}`}>
                {scorePending ? SCORE_DASH : <>{score.delta >= 0 ? "+" : ""}{score.delta}</>}
              </span>
            </div>
            {/* THE TREND IS DERIVED TOO, and from the same manual inputs, so a
                spark drawn while pending is a chart of a score we are not willing
                to print. Caught by looking at the rendered page rather than by
                reading: the foot was still showing the manual layer's first
                value (39) beside a dashed current one, which is the exact
                mismatch this change removes. The placeholder holds the spark's
                own height so the card does not resize when the real one lands. */}
            {scorePending
              ? <div style={{ height: 96 }} aria-hidden="true" />
              : <PlanSpark data={score.trend} k="--jnpr-accent" height={96} />}
            <div className="st-foot">
              <span>
                {scorePending ? <span className="pending">{SCORE_DASH}</span> : score.trend[0]}
                {" "}· {score.trend.length} mo ago
              </span>
              <span><b className={scorePending ? "tnum pending" : "tnum"}>{scorePending ? SCORE_DASH : score.value}</b> · now</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <h3>What goes into it</h3>
            {headroom > 0 && (
              <span className="fg-headroom"><b className="tnum">+{headroom}</b> available</span>
            )}
          </div>
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
