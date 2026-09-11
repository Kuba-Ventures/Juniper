// Turns a member's own plans into per-factor progress the score engine can
// treat as a real signal (issue #407): a "$5,000 of $10,000" emergency-fund
// plan is money the member told us about, and the score should not stay
// blind to it just because it isn't sitting in a linked account yet.
//
// Deliberately scoped to "save"-shaped factors only (emergency, investing),
// matching ScoreInput.planProgress in api/_score.ts: a plan's own numbers can
// only ever ADD confidence there (folded in with `max`, never overriding a
// real figure downward). Debt/credit are left alone on purpose, the same
// reason api/_finance-snapshot.ts already refuses to read a member-typed
// credit limit into the credit factor: a payoff plan's self-reported progress
// could otherwise let a member claim a smaller balance than a linked account
// or a credit bureau actually reports.
//
// Pure and I/O-free like api/_score.ts itself: the caller (fetchScoreInput)
// does the actual `plans` read and hands the rows in here. Mirrors the
// shape/keyword matching in
// artifacts/juniper/src/lib/score-levers.ts (FACTOR_ROUTES/planForFactor),
// kept in sync deliberately, the same convention this whole score engine
// already follows for the formula itself.
import type { FactorKey } from "./_score";

interface PlanGoal {
  name?: string | null;
  headline?: string | null;
  shape?: string | null;
  target_value?: number | null;
  current_value?: number | null;
}

export interface PlanRow {
  domain: string;
  status?: string | null;
  goal: PlanGoal | null;
}

const SCOREABLE_ROUTES: Record<"emergency" | "investing", { words: string[] }> = {
  emergency: { words: ["emergency", "rainy day", "safety net"] },
  investing: { words: ["invest", "retire", "401", "brokerage"] },
};

// Mirrors suggestShape/planShape in artifacts/juniper/src/lib/plans.ts: an
// explicit goal.shape wins, else a keyword guess against the plan's own text,
// "save" as the default (the only shape either scoreable factor matches).
function shapeOf(goal: PlanGoal | null, domain: string): string {
  const stored = goal?.shape;
  if (stored === "save" || stored === "buy" || stored === "payoff" || stored === "income") return stored;
  const hay = [goal?.name, goal?.headline, domain].filter(Boolean).join(" ").toLowerCase();
  if (["loan", "debt", "card", "payoff", "paydown", "credit", "owe"].some((w) => hay.includes(w))) return "payoff";
  if (["home", "house", "property", "condo", "mortgage", "car", "vehicle", "buy"].some((w) => hay.includes(w))) return "buy";
  if (["income", "salary", "raise", "promotion", "freelance"].some((w) => hay.includes(w))) return "income";
  return "save";
}

export function planProgressByFactor(
  plans: PlanRow[],
): Partial<Record<FactorKey, { current: number; target: number }>> {
  const out: Partial<Record<FactorKey, { current: number; target: number }>> = {};
  for (const [factor, route] of Object.entries(SCOREABLE_ROUTES) as [FactorKey, { words: string[] }][]) {
    const match = plans.find((p) => {
      if (p.status === "completed") return false;
      if (shapeOf(p.goal, p.domain) !== "save") return false;
      const hay = [p.goal?.name, p.goal?.headline, p.domain].filter(Boolean).join(" ").toLowerCase();
      return route.words.some((w) => hay.includes(w));
    });
    const target = Number(match?.goal?.target_value ?? 0);
    if (match && target > 0) {
      out[factor] = { current: Number(match.goal?.current_value ?? 0), target };
    }
  }
  return out;
}
