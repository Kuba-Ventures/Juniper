// Projection math for completed plans.
// ------------------------------------------------------------------
// Deterministic, client-side. Nothing here touches the synthesis prompt, the
// stored KPIs, or the plan write shape.
//
// Two modes:
//   savings  — grow current savings to a target by a date. Interest HELPS, so
//              the required monthly contribution is lower than gap / months
//              (Home Buying down payment, Baby Planning fund).
//   debt     — pay a balance down to zero. Interest HURTS, so we contrast a
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
  primary: SeriesPoint[]; // filled line — the recommended path
  compare: SeriesPoint[] | null; // dashed contrast line
  primaryLabel: string;
  compareLabel: string | null;
  targetRefLabel: string;
  startLabel: string;
  endAxisLabel: string;
  markers: { month: number; label: string; value: number }[];
  readout: React.ReactNode;
  vehicle: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
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
function savingsView(opts: {
  current: number;
  target: number;
  months: number;
  apy: number;
  vehicle: string;
  targetDate?: string;
  goalNoun: string; // "down payment target" / "baby fund"
}): ProjectionView | null {
  const { current, target, months, apy, vehicle, targetDate, goalNoun } = opts;
  const m = Math.max(1, Math.round(months));
  if (target <= 0 || current >= target) return null;
  const i = apy / 12;

  const monthlyNoInterest = (target - current) / m;
  let pmt: number;
  if (i === 0) pmt = monthlyNoInterest;
  else {
    const growth = Math.pow(1 + i, m);
    pmt = (target - current * growth) / ((growth - 1) / i);
  }
  pmt = Math.max(0, pmt);

  const primary: SeriesPoint[] = [{ month: 0, value: current }];
  const compare: SeriesPoint[] = [{ month: 0, value: current }];
  let bal = current;
  let principal = current;
  for (let month = 1; month <= m; month++) {
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
    if (hit && hit.month > 0 && hit.month < m) markers.push({ month: hit.month, label: `${pct}%`, value: hit.value });
  }

  const apyPct = `${(apy * 100).toFixed(1)}%`;
  const dateLabel = monthLabel(targetDate);
  const readout = (
    <>
      Saving about <strong>{money(pmt)}/mo</strong> in {vehicle} ({apyPct} APY) reaches your{" "}
      {money(target)} {goalNoun}
      {dateLabel ? ` by ${dateLabel}` : ""}. Interest earns roughly {money(Math.round(interestEarned / 100) * 100)} of
      that, so you set aside less than the {money(monthlyNoInterest)}/mo a plain account would need.
    </>
  );

  return {
    mode: "savings",
    months: m,
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
    endAxisLabel: dateLabel ?? `${m} mo`,
    markers,
    readout,
    vehicle,
  };
}

// ── Debt: contrast a 0% balance transfer (linear payoff) against paying the
// same amount while a typical card APR accrues. ────────────────────────────
function debtView(opts: { balance: number; monthlyPayment: number; apr: number }): ProjectionView | null {
  const { balance, monthlyPayment, apr } = opts;
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
  const readout =
    stillOwedAtApr > balance * 0.02 ? (
      <>
        Paying <strong>{money(monthlyPayment)}/mo</strong>, a 0% balance transfer clears your {money(balance)} in{" "}
        {payoffMonths} months. At a typical {aprPct} card APR you'd still owe about {money(stillOwedAtApr)} at that
        point, so the transfer is what makes the timeline real.
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
    compareLabel: `At ~${aprPct} APR`,
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
    });
  }

  if (plan.domain === "baby-planning") {
    const goal = num(collected.savings_goal);
    const targetYear = num(collected.target_year);
    if (goal == null || goal <= 0 || targetYear == null) return null;
    const monthsOut = Math.max(6, (targetYear - new Date().getFullYear()) * 12);
    return savingsView({
      current: 0, // baby fund starts fresh; we don't collect a "saved so far"
      target: goal,
      months: monthsOut,
      apy: HYSA_APY,
      vehicle: "a high-yield savings account",
      targetDate: `${targetYear}-01`,
      goalNoun: "baby fund",
    });
  }

  if (plan.domain === "debt-paydown") {
    const balance = num(collected.total_debt);
    const monthly = num(collected.monthly_target);
    if (balance == null || balance <= 0 || monthly == null || monthly <= 0) return null;
    return debtView({ balance, monthlyPayment: monthly, apr: CARD_APR });
  }

  return null;
}
