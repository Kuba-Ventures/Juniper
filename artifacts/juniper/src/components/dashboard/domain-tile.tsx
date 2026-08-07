import { useState, type ReactNode } from "react";
import type { PlanKpi, PlanNextAction } from "@/lib/plans";

const sage = "hsl(var(--primary))";
const ink = "hsl(var(--foreground))";
const muted = "hsl(var(--muted-foreground))";
const border = "hsl(var(--border))";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type Props = {
  title: string;
  description: string;
  icon: ReactNode;
  onStart: () => void;
  state?: "empty" | "in_progress" | "completed";
  goalHeadline?: string | null;
  kpis?: PlanKpi[];
  nextActions?: PlanNextAction[];
};

export function DomainTile({
  title,
  description,
  icon,
  onStart,
  state = "empty",
  goalHeadline,
  kpis,
  nextActions,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const buttonLabel =
    state === "in_progress"
      ? "Continue plan"
      : state === "completed"
        ? "View plan"
        : "Start this plan";

  const isActive = state === "completed";
  const subhead = state !== "empty" && goalHeadline ? goalHeadline : description;
  const topKpis = isActive ? (kpis ?? []).slice(0, 2) : [];
  const topNextAction = isActive
    ? (nextActions ?? []).find((a) => !a.completed) ?? null
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "hsl(var(--card))",
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: "28px 26px",
        display: "flex",
        flexDirection: "column",
        gap: isActive ? 16 : 18,
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: hovered ? "0 4px 24px rgba(0,0,0,0.06)" : "none",
        borderColor: hovered ? "hsl(var(--primary) / 0.45)" : border,
        position: "relative",
      }}
    >
      {state !== "empty" && (
        <span
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: state === "completed" ? sage : muted,
            fontFamily: sans,
          }}
        >
          {state === "completed" ? "Active" : "In progress"}
        </span>
      )}

      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "hsl(var(--primary) / 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: sage,
        }}
      >
        {icon}
      </div>

      <div>
        <p style={{ fontFamily: serif, fontSize: 19, color: ink, margin: "0 0 6px", fontWeight: 400 }}>
          {title}
        </p>
        <p
          style={{
            fontSize: 13.5,
            color: state === "empty" ? muted : ink,
            margin: 0,
            lineHeight: 1.55,
            fontWeight: state === "empty" ? 400 : 500,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {subhead}
        </p>
      </div>

      {topKpis.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {topKpis.map((k, i) => (
            <MiniKpi key={i} kpi={k} />
          ))}
        </div>
      )}

      {topNextAction && (
        <p
          style={{
            fontSize: 12.5,
            color: muted,
            margin: 0,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontFamily: sans,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              letterSpacing: "0.08em",
              fontSize: 10,
              textTransform: "uppercase",
              color: sage,
              marginRight: 6,
            }}
          >
            Next
          </span>
          {topNextAction.label}
        </p>
      )}

      <button
        onClick={onStart}
        style={{
          marginTop: "auto",
          alignSelf: "flex-start",
          background: "transparent",
          color: sage,
          border: `1.5px solid ${sage}`,
          borderRadius: 8,
          padding: "9px 18px",
          fontFamily: sans,
          fontSize: 13.5,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--primary) / 0.10)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function MiniKpi({ kpi }: { kpi: PlanKpi }) {
  const pct = kpi.target !== 0 ? Math.min(100, Math.max(0, (kpi.current / kpi.target) * 100)) : 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 11.5, color: muted, fontFamily: sans }}>{kpi.label}</span>
        <span style={{ fontSize: 11.5, color: ink, fontFamily: sans, fontWeight: 500 }}>
          {formatKpiShort(kpi.current, kpi.unit)}{" "}
          <span style={{ color: muted, fontWeight: 400 }}>/ {formatKpiShort(kpi.target, kpi.unit)}</span>
        </span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: "hsl(var(--primary) / 0.12)",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: sage, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function formatKpiShort(v: number, unit: string): string {
  if (unit === "$") {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  }
  if (unit === "%") return `${v.toFixed(0)}%`;
  return `${v} ${unit}`;
}
