// A "way to improve" -> the member's own plan.
//
// The score itself has always been real, computed from linked balances. This
// column was not: it looked each lever up in the demo household's five seeded
// plans, so a member who has never made a plan read `Work on "Pay off student
// loans"` in a stranger's color, under a number computed from their own money.
// The score engine's `planIcon` field existed only to feed that lookup and is
// gone with it.
//
// This table is the ONE place the app decides what "a plan for this" means,
// shared by the Score page's own "Ways to improve" column and the Overview's
// "Score levers" widget (issue #290), so the two surfaces cannot disagree
// about whether a member is already working a lever. Two halves per factor:
//
//   match: which of the member's REAL plans counts as already working the lever.
//     `shape` is Stage 3's own framing (save / buy / payoff) read off each plan
//     with `planShape`, so a row written before `goal.shape` existed is
//     classified by the same `suggestShape` keywords the rest of the app uses,
//     and there is no second matching scheme to drift out of step. The shape is
//     STATED here rather than guessed from the factor's own wording, for the
//     reason GOAL_ROUTES states its shapes on the Plans page: a guess that falls
//     through to the "save" default mismatches silently. `words` narrows within
//     a shape, checked against the plan's own text (title, headline, key), and
//     omitting it means every plan of that shape qualifies. Deliberately
//     narrower than SHAPE_KEYWORDS: "fund" on its own would let a baby fund
//     answer for an emergency fund.
//   offer: what a caller with no such plan should do. `template` names a
//     template on the Plans page, `template: null` means no plan shape holds the
//     lever honestly and it should be handed to the planner instead, the same
//     call the Plans page makes for a signup goal like "increase my income".
//
// Either way nothing is fabricated: an unmatched factor borrows no plan's
// title, color or icon.
import type { FactorKey } from "@/lib/mock-data";
import { planShape, planTitle, planNumbers, type Plan, type PlanShape } from "@/lib/plans";

export type FactorRoute = {
  shape: PlanShape | null;
  words?: string[];
  template: string | null;
  cta: string;
};

export const FACTOR_ROUTES: Record<FactorKey, FactorRoute> = {
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

export const routeFor = (factor: FactorKey): FactorRoute => FACTOR_ROUTES[factor] ?? UNKNOWN_FACTOR;

// The member's own plan for a factor, or null when they have none. Completed
// plans are skipped: "work on" a goal they already finished is not a next step.
// Plans arrive newest-touched first (/api/plans orders by updated_at), so when
// two qualify the row points at the one they are actually working in.
export function planForFactor(factor: FactorKey, plans: Plan[]): Plan | null {
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

// The member's own target and saved-so-far, per factor, for the score engine
// (issue #407): a plan's own numbers are real money the member told us about,
// so the score should not stay blind to them just because they aren't in a
// linked account yet. Scoped to "emergency" and "investing" on purpose, the
// only two factors ScoreInput.planProgress accepts (see api/_score.ts): those
// are the ones where a plan's own figure can only ever ADD confidence, never
// let a member claim a smaller balance than a real account reports.
const SCOREABLE_FACTORS: FactorKey[] = ["emergency", "investing"];

export function planProgressByFactor(
  plans: Plan[],
): Partial<Record<FactorKey, { current: number; target: number }>> {
  const out: Partial<Record<FactorKey, { current: number; target: number }>> = {};
  for (const factor of SCOREABLE_FACTORS) {
    const plan = planForFactor(factor, plans);
    if (!plan) continue;
    const { current, target } = planNumbers(plan);
    if (target > 0) out[factor] = { current, target };
  }
  return out;
}
