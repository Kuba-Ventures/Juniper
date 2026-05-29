import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DialogueInterface } from "@/components/dialogue/dialogue-interface";
import { fetchPlan, type Plan } from "@/lib/plans";
import { getClientScript } from "@/lib/dialogue-scripts";
import { UserProfile } from "@/lib/profile";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type Props = {
  domain: string;
  profile: UserProfile | null;
  onPlanChanged?: () => void;
};

export function PlanDetail({ domain, profile, onPlanChanged }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const script = getClientScript(domain);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlan(domain).then((p) => {
      if (!cancelled) {
        setPlan(p);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  if (loading) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: muted,
          fontFamily: sans,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!script) {
    return (
      <div style={{ padding: 40, fontFamily: sans, color: muted }}>
        <p>Unknown plan domain: {domain}</p>
        <Link href="/app" style={{ color: sage }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (plan?.status === "completed") {
    return (
      <PlanSummary
        plan={plan}
        onRestart={() => {
          setPlan({ ...plan, status: "in_progress", current_step_index: 0, dialogue_history: [] });
        }}
      />
    );
  }

  return (
    <DialogueInterface
      domain={domain}
      profile={profile}
      initialPlan={plan}
      onPlanCompleted={(saved) => {
        setPlan(saved);
        onPlanChanged?.();
      }}
    />
  );
}

function PlanSummary({ plan, onRestart }: { plan: Plan; onRestart: () => void }) {
  const summary = plan.goal?.summary?.trim();
  const isLight =
    (!plan.kpis || plan.kpis.length === 0) &&
    (!plan.milestones || plan.milestones.length === 0) &&
    (!plan.next_actions || plan.next_actions.length === 0);

  return (
    <div style={{ height: "100%", overflowY: "auto", background: cream }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 28px 80px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "0 0 14px",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: sage,
              margin: 0,
              fontFamily: sans,
            }}
          >
            Your Home Buying plan
          </p>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: muted,
              fontFamily: sans,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: sage,
                display: "inline-block",
              }}
            />
            Saved · find it on your dashboard
          </span>
        </div>
        <h1
          style={{
            fontFamily: serif,
            fontSize: "clamp(26px, 4vw, 34px)",
            fontWeight: 400,
            color: ink,
            margin: "0 0 22px",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
          }}
        >
          {plan.goal?.headline ?? "Your plan is set."}
        </h1>

        {summary && (
          <section style={{ marginBottom: 32 }}>
            {summary.split(/\n\n+/).map((para, i) => (
              <p
                key={i}
                style={{
                  fontSize: 16,
                  color: ink,
                  lineHeight: 1.65,
                  margin: "0 0 14px",
                }}
              >
                {para.trim()}
              </p>
            ))}
          </section>
        )}

        {isLight && (
          <div
            style={{
              background: "rgba(185,64,64,0.06)",
              border: "1px solid rgba(185,64,64,0.2)",
              borderRadius: 10,
              padding: "14px 18px",
              fontSize: 13.5,
              color: "#b94040",
              margin: "0 0 22px",
              lineHeight: 1.55,
            }}
          >
            This plan saved without KPIs, milestones, or next actions. Likely a
            generation error. Tap "Redo this plan" to try again.
          </div>
        )}

        {plan.kpis?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>KPIs</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {plan.kpis.map((k, i) => (
                <KpiCard key={i} label={k.label} current={k.current} target={k.target} unit={k.unit} />
              ))}
            </div>
          </section>
        )}

        {plan.milestones?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>Milestones</h2>
            <ul style={listStyle}>
              {plan.milestones.map((m, i) => (
                <li key={i} style={itemStyle}>
                  <span style={{ color: ink, fontSize: 15 }}>{m.label}</span>
                  {typeof m.target_value === "number" && (
                    <span style={{ color: muted, fontSize: 13, marginLeft: 8 }}>
                      ({formatVal(m.current_value)} / {formatVal(m.target_value)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.next_actions?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeading}>Next actions</h2>
            <ul style={listStyle}>
              {plan.next_actions.map((a, i) => (
                <li key={i} style={itemStyle}>
                  <span style={{ color: ink, fontSize: 15 }}>{a.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          <Link
            href="/app"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "transparent",
              color: sage,
              border: `1.5px solid ${sage}`,
              borderRadius: 8,
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Back to dashboard
          </Link>
          <button
            onClick={onRestart}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: muted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Redo this plan
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 14px",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const itemStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${border}`,
  borderRadius: 10,
  padding: "12px 16px",
};

function KpiCard({ label, current, target, unit }: { label: string; current: number; target: number; unit: string }) {
  const pct = target !== 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
  return (
    <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
      <p style={{ fontSize: 12, color: muted, margin: "0 0 4px", fontFamily: sans }}>{label}</p>
      <p style={{ fontFamily: serif, fontSize: 20, color: ink, margin: "0 0 10px" }}>
        {formatKpi(current, unit)} <span style={{ color: muted, fontSize: 14 }}>/ {formatKpi(target, unit)}</span>
      </p>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "rgba(92,122,101,0.12)",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: sage, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function formatKpi(v: number, unit: string): string {
  if (unit === "$") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return `${v} ${unit}`;
}

function formatVal(v: unknown): string {
  if (typeof v === "number") return v.toLocaleString();
  return String(v ?? "-");
}
