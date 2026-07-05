// Savings-projection math for completed plans.
// ------------------------------------------------------------------
// Deterministic, client-side compound-interest projection. Nothing here
// touches the synthesis prompt, the stored KPIs, or the plan write shape.
//
// The plan's headline "monthly savings needed" is a plain gap / months figure
// (no interest). When the money sits in a high-yield savings account it earns
// interest, so the required monthly contribution is lower and part of the goal
// is met by growth. This models that.

import type { Plan } from "./plans";

export type ProjectionPoint = { month: number; balance: number; principal: number };

export type SavingsProjection = {
  months: number;
  current: number;
  target: number;
  apy: number; // e.g. 0.035
  monthlyContribution: number; // interest-aware PMT to hit target on time
  monthlyNoInterest: number; // naive gap / months (the plan's headline figure)
  interestEarned: number; // total growth over the horizon
  finalBalance: number;
  series: ProjectionPoint[]; // month 0..months, for the chart
  markers: { month: number; pct: number; balance: number }[]; // 25/50/75% crossings
};

// Solve for the monthly contribution that grows `current` to `target` over
// `months`, compounding monthly at `apy`. Falls back to simple division when
// there's no rate or horizon.
export function projectSavings(
  current: number,
  target: number,
  months: number,
  apy: number,
): SavingsProjection {
  const m = Math.max(0, Math.round(months));
  const i = apy / 12;
  const monthlyNoInterest = m > 0 ? Math.max(0, (target - current) / m) : 0;

  let pmt: number;
  if (m <= 0) {
    pmt = 0;
  } else if (i === 0) {
    pmt = monthlyNoInterest;
  } else {
    const growth = Math.pow(1 + i, m);
    pmt = (target - current * growth) / ((growth - 1) / i);
  }
  pmt = Math.max(0, pmt);

  const series: ProjectionPoint[] = [{ month: 0, balance: current, principal: current }];
  let balance = current;
  let principal = current;
  for (let month = 1; month <= m; month++) {
    balance = balance * (1 + i) + pmt;
    principal = principal + pmt;
    series.push({ month, balance, principal });
  }

  const interestEarned = Math.max(0, balance - principal);
  const markers: { month: number; pct: number; balance: number }[] = [];
  for (const pct of [25, 50, 75]) {
    const threshold = target * (pct / 100);
    const hit = series.find((p) => p.balance >= threshold);
    if (hit && hit.month > 0 && hit.month < m) {
      markers.push({ month: hit.month, pct, balance: hit.balance });
    }
  }

  return {
    months: m,
    current,
    target,
    apy,
    monthlyContribution: pmt,
    monthlyNoInterest,
    interestEarned,
    finalBalance: balance,
    series,
    markers,
  };
}

// Per-domain projection assumptions. Only savings-accumulation domains have a
// meaningful "grow toward a target" curve. Rates are illustrative HYSA APYs;
// tie to a real partner rate when offers are approved.
const DOMAIN_PROJECTION: Record<string, { apy: number; vehicle: string }> = {
  "home-buying": { apy: 0.035, vehicle: "a high-yield savings account" },
};

export type ProjectionInput = {
  domain: string;
  current: number;
  target: number;
  months: number;
  apy: number;
  vehicle: string;
  targetDate?: string; // "YYYY-MM"
};

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

// Extract projection inputs from a completed plan, or null when the domain
// isn't a savings-projection case or the numbers aren't available (e.g. an
// older plan created before the tap-first flow). Reads the deterministic
// answers the client stored in current_state.collected.
export function planProjectionInput(plan: Plan): ProjectionInput | null {
  const cfg = DOMAIN_PROJECTION[plan.domain];
  if (!cfg) return null;

  const collected = ((plan.current_state?.collected as Record<string, unknown>) ?? {});

  if (plan.domain === "home-buying") {
    const price = num(collected.target_home_price);
    const saved = num(collected.total_savings);
    const months = num(collected.target_months);
    if (price == null || saved == null || months == null || months <= 0) return null;
    return {
      domain: plan.domain,
      current: Math.max(0, saved),
      target: Math.round(price * 0.2),
      months,
      apy: cfg.apy,
      vehicle: cfg.vehicle,
      targetDate: typeof collected.target_date === "string" ? collected.target_date : undefined,
    };
  }

  return null;
}
