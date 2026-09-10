// Server port of how a plan CARD reads its own numbers and projects its finish
// date, so the chat answers "when will this be done" with the same arithmetic
// the member is already looking at.
//
// This mirrors `planNumbers`, `planShape`, `planTitle`, `monthsToClose` and
// `monthLabelFromNow` in artifacts/juniper/src/lib/plans.ts, the same way
// api/_score.ts mirrors src/lib/score.ts. Keep the two in step if the formula
// changes; both are deliberately pure, dependency-free and I/O-free.
//
// ── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────────
//
// The plan card said "Ready to buy Nov 2029" and the chat, asked about the same
// plan in the same session, answered "early 2029" for one scenario and
// "mid-2028" for another. Nothing was computing those chat dates: the model was
// doing the arithmetic in the reply, from whatever figures happened to be in the
// conversation, with no reference date (a model does not know today) and no
// stated rate assumption. Three answers to one question, none of them wrong on
// purpose. The fix is that the chat stops deriving a date at all: the tool hands
// it the projection this module computes and the prompt forbids a second one.

export type PlanShape = "save" | "buy" | "payoff" | "income";

/** The subset of a `plans` row every function here reads. */
export interface PlanRow {
  domain: string;
  status?: string | null;
  goal?: Record<string, unknown> | null;
  current_state?: Record<string, unknown> | null;
  kpis?: Array<{ label?: string; current?: number; target?: number; unit?: string }> | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/* ── Shape ─────────────────────────────────────────────────────────────── */

const isShape = (v: unknown): v is PlanShape =>
  v === "save" || v === "buy" || v === "payoff" || v === "income";

// Mirrors SHAPE_KEYWORDS in src/lib/plans.ts, order included: the order is the
// rule ("pay off the car loan" is a payoff, not a purchase), so a reordering
// here would silently give the chat a different shape, and therefore a
// different rate assumption, than the card for the same plan.
const SHAPE_KEYWORDS: Array<{ shape: PlanShape; words: string[] }> = [
  { shape: "payoff", words: ["loan", "debt", "card", "payoff", "paydown", "credit", "owe"] },
  { shape: "buy", words: ["home", "house", "property", "condo", "mortgage", "car", "vehicle", "buy"] },
  { shape: "income", words: ["income", "salary", "raise", "promotion", "freelance"] },
  { shape: "save", words: ["nomad", "travel", "trip", "wedding", "baby", "family", "fund", "emergency", "retire", "save", "saving", "vacation"] },
];

export function suggestShape(...text: Array<string | null | undefined>): PlanShape {
  const hay = text.filter(Boolean).join(" ").toLowerCase();
  for (const { shape, words } of SHAPE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return shape;
  }
  return "save";
}

export function planShape(plan: PlanRow): PlanShape {
  const stored = plan.goal?.shape;
  if (isShape(stored)) return stored;
  return suggestShape(str(plan.goal?.name), str(plan.goal?.headline), plan.domain);
}

/* ── Title ─────────────────────────────────────────────────────────────── */

const DOMAIN_TITLES: Record<string, string> = {
  "home-buying": "Home buying",
  "combining-finances": "Combining finances",
  "debt-paydown": "Debt paydown",
  "baby-planning": "Baby planning",
  prenup: "Prenup and legal",
};

function titleFromSlug(slug: string): string {
  const words = slug.replace(/[_-]+/g, " ").trim();
  if (!words) return "Untitled plan";
  return words[0].toUpperCase() + words.slice(1);
}

export function planTitle(plan: PlanRow): string {
  return str(plan.goal?.name) ?? DOMAIN_TITLES[plan.domain] ?? titleFromSlug(plan.domain);
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

export interface PlanNumbers {
  current: number;
  target: number;
  monthly: number | null;
  targetDate: string | null;
  rate: number | null; // annual percentage, payoff shapes only
}

/** Newest convention first, so a plan written by the Plans page and one written
 *  by the old dialogue synthesis both come back usable. Mirrors planNumbers(). */
export function planNumbers(plan: PlanRow): PlanNumbers {
  const goal = plan.goal ?? {};
  const collected = (plan.current_state?.collected as Record<string, unknown> | undefined) ?? {};

  const moneyKpi = (plan.kpis ?? []).find((k) => num(k?.target) != null && (k.target as number) > 0) ?? null;

  const target = num(goal.target_value) ?? num(moneyKpi?.target) ?? 0;
  const current = num(goal.current_value) ?? num(moneyKpi?.current) ?? 0;
  const monthly = num(goal.monthly_contribution) ?? num(collected.monthly_contribution);
  const targetDate = str(goal.target_date) ?? str(collected.target_date);

  let rate = num(goal.rate);
  if (rate == null) {
    const debts = Array.isArray(plan.current_state?.debts)
      ? (plan.current_state?.debts as Array<{ balance?: unknown; apr?: unknown }>)
      : [];
    let bal = 0;
    let weighted = 0;
    for (const d of debts) {
      const b = num(d?.balance);
      if (b == null || b <= 0) continue;
      bal += b;
      weighted += b * (num(d?.apr) ?? 0);
    }
    if (bal > 0) rate = weighted / bal;
  }

  return { current, target, monthly, targetDate, rate };
}

/* ── Projection ────────────────────────────────────────────────────────── */

/** Months to close a `remaining` gap at `monthly` a month, with `annualRate`
 *  (a percentage) compounding on the gap. Rate 0 is the honest default for
 *  saving: we do not know what yield the member's cash earns, so we do not
 *  invent one, and neither may the chat. Null when the math does not resolve. */
export function monthsToClose(remaining: number, monthly: number | null, annualRate = 0): number | null {
  if (remaining <= 0) return 0;
  if (monthly == null || monthly <= 0) return null;
  const r = annualRate > 0 ? annualRate / 100 / 12 : 0;
  if (r === 0) return Math.ceil(remaining / monthly);
  if (monthly <= remaining * r) return null;
  const months = Math.log(monthly / (monthly - remaining * r)) / Math.log(1 + r);
  return Number.isFinite(months) ? Math.ceil(months) : null;
}

/** "Mar 2027", `months` from `now`. `now` is a parameter rather than a
 *  Date.now() call inside so the reference date is explicit: the whole reason
 *  the chat's dates drifted from the card's is that nobody could say what
 *  "from now" meant. */
export function monthLabelFromNow(months: number, now: Date): string {
  const d = new Date(now.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2028-06" (what the dialogue scripts store) or anything Date can parse.
 *  Falls through to the raw string so a member-typed "next spring" is shown
 *  rather than swallowed. */
export function formatTargetDate(raw: string): string {
  const ym = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (ym) {
    return new Date(Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(raw)) {
    return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return raw;
}

export interface PlanProjection extends PlanNumbers {
  domain: string;
  title: string;
  shape: PlanShape;
  completed: boolean;
  remaining: number;
  /** Months left at the plan's own pace, null when the pace does not resolve
   *  (no monthly amount, or interest outrunning the payment). */
  monthsRemaining: number | null;
  /** The finish line exactly as the plan card states it, e.g. "Nov 2029", or
   *  null when the card shows none either. `source` says which it is, because
   *  a date the member SET is not a projection and must not be described as
   *  one. */
  completionMonth: string | null;
  completionSource: "member_set" | "projected" | "none";
  /** The rate this projection compounded at, spelled out so an answer can say
   *  so instead of the model assuming a return nobody stated. */
  assumedAnnualRatePct: number;
}

/**
 * The card's own reading of a plan, projection included. `now` is required:
 * see monthLabelFromNow.
 *
 * Mirrors `viewOf` in src/pages/app/plans.tsx for the two things that decide a
 * date: income plans get no projection at all (there is no contribution to
 * pace from, and inventing a raise-and-therefore-date would be a number nobody
 * gave us), and a rate is applied only to a payoff balance, because a payoff
 * balance keeps accruing while a savings pot's yield is unknown.
 */
export function projectPlan(plan: PlanRow, now: Date): PlanProjection {
  const shape = planShape(plan);
  const nums = planNumbers(plan);
  const remaining = Math.max(0, nums.target - nums.current);
  const ratePct = shape === "payoff" ? (nums.rate ?? 0) : 0;
  const monthsRemaining = shape === "income" ? null : monthsToClose(remaining, nums.monthly, ratePct);

  let completionMonth: string | null = null;
  let completionSource: PlanProjection["completionSource"] = "none";
  if (nums.targetDate) {
    completionMonth = formatTargetDate(nums.targetDate);
    completionSource = "member_set";
  } else if (monthsRemaining != null && monthsRemaining > 0) {
    completionMonth = monthLabelFromNow(monthsRemaining, now);
    completionSource = "projected";
  }

  return {
    ...nums,
    domain: plan.domain,
    title: planTitle(plan),
    shape,
    completed: plan.status === "completed",
    remaining,
    monthsRemaining,
    completionMonth,
    completionSource,
    assumedAnnualRatePct: ratePct,
  };
}
