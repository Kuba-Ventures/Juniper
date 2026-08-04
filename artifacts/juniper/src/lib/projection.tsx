// Projection math for completed plans.
// ------------------------------------------------------------------
// Deterministic, client-side. Nothing here touches the synthesis prompt, the
// stored KPIs, or the plan write shape.
//
// Two modes:
//   savings, grow current savings to a target by a date. Interest HELPS, so
//              the required monthly contribution is lower than gap / months
//              (Home Buying down payment, Baby Planning fund).
//   debt, pay a balance down to zero. Interest HURTS, so we contrast a
//              0% balance transfer (the recommended offer) against a typical
//              card APR to show what interest would otherwise cost.

import type React from "react";
import type { Plan } from "./plans";

// Illustrative rates. Tie to real partner rates when offers are approved.
const HYSA_APY = 0.035; // high-yield savings
const CARD_APR = 0.22; // typical credit-card APR

export type SeriesPoint = { month: number; value: number };

export type ProjectionView = {
  mode: "savings" | "debt";
  months: number;
  yMax: number;
  targetValue: number; // reference value: savings target, or 0 for debt-free
  showTargetLine: boolean;
  startValue: number;
  primary: SeriesPoint[]; // filled line, the recommended path
  compare: SeriesPoint[] | null; // dashed contrast line
  primaryLabel: string;
  compareLabel: string | null;
  targetRefLabel: string;
  startLabel: string;
  endAxisLabel: string;
  markers: { month: number; label: string; value: number }[];
  readout: React.ReactNode;
  vehicle: string;
  // When set, the user can adjust their monthly amount (savings mode); the
  // projection recomputes the timeline at that amount. undefined = not editable.
  editableMonthly?: number;
};

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) { const k = n / 1000; return `$${k % 1 === 0 ? k : k.toFixed(1)}K`; }
  return `$${Math.round(n)}`;
}
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function monthLabel(ym?: string): string | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return null;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Savings: solve the monthly contribution that grows `current` to `target`
// over `months`, compounding monthly at `apy`. ─────────────────────────────
function addMonthsYM(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function savingsView(opts: {
  current: number;
  target: number;
  months: number;
  apy: number;
  vehicle: string;
  targetDate?: string;
  goalNoun: string; // "down payment target" / "baby fund"
  // When set (>0), the user has chosen their own monthly amount; we solve for
  // the timeline at that amount instead of solving the amount for the date.
  overrideMonthly?: number;
}): ProjectionView | null {
  const { current, target, months, apy, vehicle, targetDate, goalNoun, overrideMonthly } = opts;
  const baseMonths = Math.max(1, Math.round(months));
  if (target <= 0 || current >= target) return null;
  const i = apy / 12;
  const monthlyNoInterest = (target - current) / baseMonths;

  const usingOverride = overrideMonthly != null && overrideMonthly > 0;
  let pmt: number;
  let horizon: number;
  let reached = true;
  let endDate: string | undefined = targetDate;

  if (usingOverride) {
    pmt = overrideMonthly as number;
    let bal = current;
    let mm = 0;
    while (bal < target && mm < 1200) {
      mm += 1;
      bal = bal * (1 + i) + pmt;
    }
    reached = bal >= target;
    horizon = reached ? Math.max(1, mm) : baseMonths;
    endDate = reached ? addMonthsYM(mm) : targetDate;
  } else {
    if (i === 0) pmt = monthlyNoInterest;
    else {
      const growth = Math.pow(1 + i, baseMonths);
      pmt = (target - current * growth) / ((growth - 1) / i);
    }
    pmt = Math.max(0, pmt);
    horizon = baseMonths;
  }

  const primary: SeriesPoint[] = [{ month: 0, value: current }];
  const compare: SeriesPoint[] = [{ month: 0, value: current }];
  let bal = current;
  let principal = current;
  for (let month = 1; month <= horizon; month++) {
    bal = bal * (1 + i) + pmt;
    principal = principal + pmt;
    primary.push({ month, value: bal });
    compare.push({ month, value: principal });
  }
  const interestEarned = Math.max(0, bal - principal);

  const markers: { month: number; label: string; value: number }[] = [];
  for (const pct of [25, 50, 75]) {
    const threshold = target * (pct / 100);
    const hit = primary.find((p) => p.value >= threshold);
    if (hit && hit.month > 0 && hit.month < horizon) markers.push({ month: hit.month, label: `${pct}%`, value: hit.value });
  }

  const apyPct = `${(apy * 100).toFixed(1)}%`;
  const dateLabel = monthLabel(endDate);
  const round100 = (n: number) => Math.round(n / 100) * 100;

  let readout: React.ReactNode;
  if (usingOverride && reached) {
    readout = (
      <>
        At <strong>{money(pmt)}/mo</strong> in {vehicle} ({apyPct} APY), you'll reach your {money(target)} {goalNoun}{" "}
        {dateLabel ? `around ${dateLabel}` : `in ${horizon} months`}. Interest chips in about {money(round100(interestEarned))}.
      </>
    );
  } else if (usingOverride && !reached) {
    readout = (
      <>
        At <strong>{money(pmt)}/mo</strong> you'd have about {money(bal)}
        {monthLabel(targetDate) ? ` by ${monthLabel(targetDate)}` : ` in ${horizon} months`}, short of your {money(target)}{" "}
        {goalNoun}. A little more each month closes the gap.
      </>
    );
  } else {
    readout = (
      <>
        Saving about <strong>{money(pmt)}/mo</strong> in {vehicle} ({apyPct} APY) reaches your {money(target)} {goalNoun}
        {dateLabel ? ` by ${dateLabel}` : ""}. Interest earns roughly {money(round100(interestEarned))} of that, so you set
        aside less than the {money(monthlyNoInterest)}/mo a plain account would need.
      </>
    );
  }

  return {
    mode: "savings",
    months: horizon,
    yMax: Math.max(target * 1.08, bal * 1.02, 1),
    targetValue: target,
    showTargetLine: true,
    startValue: current,
    primary,
    compare,
    primaryLabel: `With ${apyPct} APY`,
    compareLabel: "Contributions only",
    targetRefLabel: moneyShort(target),
    startLabel: `${moneyShort(current)} now`,
    endAxisLabel: dateLabel ?? `${horizon} mo`,
    markers,
    readout,
    vehicle,
    editableMonthly: Math.round(pmt),
  };
}

// ── Debt: contrast a 0% balance transfer (linear payoff) against paying the
// same amount while a typical card APR accrues. ────────────────────────────
function debtView(opts: {
  balance: number;
  monthlyPayment: number;
  apr: number;
  blended?: boolean;
}): ProjectionView | null {
  const { balance, monthlyPayment, apr, blended } = opts;
  if (balance <= 0 || monthlyPayment <= 0) return null;

  const payoffMonths = Math.max(1, Math.ceil(balance / monthlyPayment)); // 0% transfer
  const i = apr / 12;

  const primary: SeriesPoint[] = [];
  const compare: SeriesPoint[] = [];
  let atApr = balance;
  for (let month = 0; month <= payoffMonths; month++) {
    primary.push({ month, value: Math.max(0, balance - monthlyPayment * month) });
    if (month === 0) compare.push({ month, value: balance });
    else {
      atApr = Math.max(0, atApr * (1 + i) - monthlyPayment);
      compare.push({ month, value: atApr });
    }
  }
  const stillOwedAtApr = compare[compare.length - 1].value;

  const markers: { month: number; label: string; value: number }[] = [];
  for (const pct of [25, 50, 75]) {
    const remaining = balance * (1 - pct / 100);
    const hit = primary.find((p) => p.value <= remaining);
    if (hit && hit.month > 0 && hit.month < payoffMonths) markers.push({ month: hit.month, label: `${pct}%`, value: hit.value });
  }

  const aprPct = `${Math.round(apr * 100)}%`;
  const ratePhrase = blended ? `your blended ${aprPct} APR` : `a typical ${aprPct} card APR`;
  const readout =
    stillOwedAtApr > balance * 0.02 ? (
      <>
        Paying <strong>{money(monthlyPayment)}/mo</strong>, a 0% balance transfer clears your {money(balance)} in{" "}
        {payoffMonths} months. At {ratePhrase} you'd still owe about {money(stillOwedAtApr)} at that point, so the
        transfer is what makes the timeline real.
      </>
    ) : (
      <>
        Paying <strong>{money(monthlyPayment)}/mo</strong> clears your {money(balance)} in about {payoffMonths} months.
        A 0% balance transfer keeps interest from stretching that out.
      </>
    );

  return {
    mode: "debt",
    months: payoffMonths,
    yMax: balance * 1.05,
    targetValue: 0,
    showTargetLine: false,
    startValue: balance,
    primary,
    compare,
    primaryLabel: "With a 0% transfer",
    compareLabel: blended ? `At ${aprPct} blended APR` : `At ~${aprPct} APR`,
    targetRefLabel: "Debt-free",
    startLabel: `${moneyShort(balance)} debt`,
    endAxisLabel: `${payoffMonths} mo`,
    markers,
    readout,
    vehicle: "a 0% balance transfer",
  };
}

// Build a projection view for a completed plan, or null when the domain has no
// applicable projection or the inputs aren't available (e.g. an older plan, or
// missing profile numbers). Reads the deterministic answers the client stored
// in current_state.collected.
export function buildProjectionView(plan: Plan): ProjectionView | null {
  const collected = (plan.current_state?.collected as Record<string, unknown>) ?? {};

  if (plan.domain === "home-buying") {
    const price = num(collected.target_home_price);
    const saved = num(collected.total_savings);
    const months = num(collected.target_months);
    if (price == null || saved == null || months == null || months <= 0) return null;
    return savingsView({
      current: Math.max(0, saved),
      target: Math.round(price * 0.2),
      months,
      apy: HYSA_APY,
      vehicle: "a high-yield savings account",
      targetDate: typeof collected.target_date === "string" ? collected.target_date : undefined,
      goalNoun: "down payment target",
      overrideMonthly: num(collected.monthly_contribution) ?? undefined,
    });
  }

  if (plan.domain === "baby-planning") {
    const goal = num(collected.savings_goal);
    const targetYear = num(collected.target_year);
    if (goal == null || goal <= 0 || targetYear == null) return null;
    const monthsOut = Math.max(6, (targetYear - new Date().getFullYear()) * 12);
    return savingsView({
      current: Math.max(0, num(collected.baby_saved) ?? 0),
      target: goal,
      months: monthsOut,
      apy: HYSA_APY,
      vehicle: "a high-yield savings account",
      targetDate: `${targetYear}-01`,
      goalNoun: "baby fund",
      overrideMonthly: num(collected.monthly_contribution) ?? undefined,
    });
  }

  if (plan.domain === "debt-paydown") {
    const monthly = num(collected.monthly_target);
    if (monthly == null || monthly <= 0) return null;

    // Prefer the user's listed debts (summed balance + balance-weighted APR)
    // over the single onboarding number and the flat assumed rate.
    const debts = Array.isArray(plan.current_state?.debts)
      ? (plan.current_state?.debts as { balance?: unknown; apr?: unknown }[])
      : [];
    const valid = debts.filter((d) => typeof d.balance === "number" && (d.balance as number) > 0);

    let balance: number | null = num(collected.total_debt);
    let apr = CARD_APR;
    let blended = false;
    if (valid.length > 0) {
      const sum = valid.reduce((s, d) => s + (d.balance as number), 0);
      balance = sum;
      apr = valid.reduce((s, d) => s + (d.balance as number) * ((num(d.apr) ?? CARD_APR * 100) / 100), 0) / sum;
      blended = true;
    }
    if (balance == null || balance <= 0) return null;
    return debtView({ balance, monthlyPayment: monthly, apr, blended });
  }

  return null;
}
