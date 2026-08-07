import type React from "react";
import { Link } from "wouter";
import { PiggyBank, CreditCard, Target, ArrowUpRight, Flag } from "lucide-react";
import type { Plan, DebtItem, PlanMilestone, PlanNextAction } from "@/lib/plans";
import { buildProjectionView } from "@/lib/projection";
import { DOMAINS } from "@/components/dashboard/domain-tile-grid";

// Cross-plan portfolio view: a purely client-side rollup of the plans already
// fetched for the dashboard tiles. No new API calls, no migration. Users run
// several plans at once (home + debt + baby) and otherwise can't see them
// together. Aggregates only what's comparable across heterogeneous plan shapes;
// everything else falls back to a per-plan chip that links into the plan.

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageFill = "rgba(92,122,101,0.08)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";
// Slightly warmer than pure white so the summary reads as a distinct band above
// the domain tiles, without introducing a new palette token elsewhere.
const summaryBg = "#F4EFE7";

// Backstop the em-dash convention on any plan-generated text we surface.
function displayContent(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/\s+--\s+/g, ", ");
}

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function domainTitle(domain: string): string {
  return DOMAINS.find((d) => d.id === domain)?.title ?? domain.replace(/-/g, " ");
}

function collectedOf(plan: Plan): Record<string, unknown> {
  return (plan.current_state?.collected as Record<string, unknown>) ?? {};
}

// The baseline monthly a savings plan needs, ignoring any user override, by
// asking the same projection helper the plan view uses. Null for non-savings
// plans (debt/prenup/etc.) or plans missing the inputs.
function requiredMonthly(plan: Plan): number | null {
  const collected = { ...collectedOf(plan) };
  delete collected.monthly_contribution;
  const clone: Plan = {
    ...plan,
    current_state: { ...(plan.current_state ?? {}), collected },
  };
  const view = buildProjectionView(clone);
  return view && view.mode === "savings" ? view.editableMonthly ?? null : null;
}

type MilestoneRef = { label: string; domain: string; pct: number };
type ActionRef = { label: string; domain: string };

type Summary = {
  activeCount: number;
  savingsTarget: number;
  savingsPlanCount: number;
  monthlyCommitted: number;
  monthlyRequired: number;
  contributionPlanCount: number;
  debtBalance: number;
  debtBlendedApr: number | null; // percentage, e.g. 21.4
  nearestMilestone: MilestoneRef | null;
  topNextAction: ActionRef | null;
};

function summarize(plans: Plan[]): Summary {
  let savingsTarget = 0;
  let savingsPlanCount = 0;
  let monthlyCommitted = 0;
  let monthlyRequired = 0;
  let contributionPlanCount = 0;
  let debtBalance = 0;
  let debtAprWeighted = 0; // sum(balance * apr)
  let nearestMilestone: MilestoneRef | null = null;
  let topNextAction: ActionRef | null = null;

  for (const plan of plans) {
    const view = buildProjectionView(plan);

    // Savings target + committed-vs-required (savings-mode plans only).
    if (view && view.mode === "savings") {
      savingsTarget += view.targetValue;
      savingsPlanCount += 1;
      const required = requiredMonthly(plan);
      if (required != null) {
        const committed = num(collectedOf(plan).monthly_contribution) ?? required;
        monthlyRequired += required;
        monthlyCommitted += committed;
        contributionPlanCount += 1;
      }
    }

    // Debt balance + blended APR across every plan's listed debts.
    const debts = Array.isArray(plan.current_state?.debts)
      ? (plan.current_state?.debts as DebtItem[])
      : [];
    for (const d of debts) {
      const bal = num(d.balance);
      if (bal == null || bal <= 0) continue;
      const apr = num(d.apr) ?? 0;
      debtBalance += bal;
      debtAprWeighted += bal * apr;
    }

    // Nearest upcoming milestone = the incomplete milestone closest to done
    // (milestones carry progress, not dates). Highest current/target ratio wins.
    for (const m of (plan.milestones ?? []) as PlanMilestone[]) {
      if (m.completed_at) continue;
      const target = num(m.target_value);
      const current = num(m.current_value) ?? 0;
      const pct = target && target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
      if (!nearestMilestone || pct > nearestMilestone.pct) {
        nearestMilestone = { label: m.label, domain: plan.domain, pct };
      }
    }
  }

  // Top next action = first incomplete action, in dashboard/domain order so the
  // pick is stable across renders.
  const order = new Map<string, number>(DOMAINS.map((d, i) => [d.id, i]));
  const byOrder = [...plans].sort(
    (a, b) => (order.get(a.domain) ?? 99) - (order.get(b.domain) ?? 99),
  );
  for (const plan of byOrder) {
    const action = (plan.next_actions ?? []).find((a: PlanNextAction) => !a.completed);
    if (action) {
      topNextAction = { label: action.label, domain: plan.domain };
      break;
    }
  }

  return {
    activeCount: plans.length,
    savingsTarget,
    savingsPlanCount,
    monthlyCommitted,
    monthlyRequired,
    contributionPlanCount,
    debtBalance,
    debtBlendedApr: debtBalance > 0 ? debtAprWeighted / debtBalance : null,
    nearestMilestone,
    topNextAction,
  };
}

const cardHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 20,
  fontWeight: 400,
  color: ink,
  margin: 0,
  letterSpacing: "-0.01em",
};

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: sage }}>
        {icon}
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: muted }}>
          {label.toUpperCase()}
        </span>
      </div>
      <p style={{ fontFamily: serif, fontSize: 22, color: ink, margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontFamily: sans, fontSize: 12.5, color: muted, margin: "5px 0 0", lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );
}

function FocusRow({
  icon,
  label,
  text,
  domain,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  domain: string;
}) {
  return (
    <Link
      href={`/app/plans/${domain}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 14px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ color: sage, display: "flex", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", color: muted, margin: 0 }}>
          {label.toUpperCase()} · {domainTitle(domain).toUpperCase()}
        </p>
        <p style={{ fontFamily: sans, fontSize: 14, color: ink, margin: "3px 0 0", lineHeight: 1.4 }}>
          {displayContent(text)}
        </p>
      </div>
      <ArrowUpRight size={16} color={muted} strokeWidth={2.2} style={{ flexShrink: 0 }} />
    </Link>
  );
}

export function PortfolioSummary({ plans }: { plans: Plan[] }) {
  // Gentle no-op below 2 plans: there's no "portfolio" to roll up yet.
  if (plans.length < 2) return null;

  const s = summarize(plans);

  const onTrack = s.monthlyCommitted + 0.5 >= s.monthlyRequired;

  return (
    <section
      style={{
        background: summaryBg,
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: "22px 24px",
        marginBottom: 36,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h2 style={cardHeading}>Your plans at a glance</h2>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: sage, fontWeight: 600 }}>
          {s.activeCount} active plans
        </span>
      </div>

      {/* Comparable numeric rollups. Each tile renders only when it has data. */}
      {(s.savingsPlanCount > 0 || s.debtBalance > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {s.savingsPlanCount > 0 && s.savingsTarget > 0 && (
            <StatTile
              icon={<Target size={16} strokeWidth={2} />}
              label="Savings goals"
              value={money(s.savingsTarget)}
              sub={`across ${s.savingsPlanCount} ${s.savingsPlanCount === 1 ? "plan" : "plans"}`}
            />
          )}
          {s.contributionPlanCount > 0 && (
            <StatTile
              icon={<PiggyBank size={16} strokeWidth={2} />}
              label="Saving per month"
              value={`${money(s.monthlyCommitted)}/mo`}
              sub={
                onTrack
                  ? `on track, needs ${money(s.monthlyRequired)}/mo`
                  : `${money(s.monthlyRequired)}/mo needed to stay on pace`
              }
            />
          )}
          {s.debtBalance > 0 && (
            <StatTile
              icon={<CreditCard size={16} strokeWidth={2} />}
              label="Total debt"
              value={money(s.debtBalance)}
              sub={s.debtBlendedApr != null ? `${s.debtBlendedApr.toFixed(1)}% blended APR` : undefined}
            />
          )}
        </div>
      )}

      {/* Nearest milestone + top next action, each linking into its plan. */}
      {(s.nearestMilestone || s.topNextAction) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
          {s.nearestMilestone && (
            <FocusRow
              icon={<Flag size={17} strokeWidth={2} />}
              label="Closest milestone"
              text={s.nearestMilestone.label}
              domain={s.nearestMilestone.domain}
            />
          )}
          {s.topNextAction && (
            <FocusRow
              icon={<ArrowUpRight size={17} strokeWidth={2} />}
              label="Next up"
              text={s.topNextAction.label}
              domain={s.topNextAction.domain}
            />
          )}
        </div>
      )}

      {/* Per-plan chips, the catch-all for heterogeneous shapes (e.g. prenup,
          combining finances) that don't map to a numeric rollup. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {plans.map((p) => (
          <Link
            key={p.domain}
            href={`/app/plans/${p.domain}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: sageFill,
              border: `1px solid ${border}`,
              borderRadius: 999,
              padding: "6px 12px",
              fontFamily: sans,
              fontSize: 12.5,
              fontWeight: 500,
              color: ink,
              textDecoration: "none",
            }}
          >
            {domainTitle(p.domain)}
            {p.status === "in_progress" && (
              <span style={{ color: muted, fontWeight: 400 }}>· in progress</span>
            )}
            <ArrowUpRight size={13} color={sage} strokeWidth={2.2} />
          </Link>
        ))}
      </div>
    </section>
  );
}
