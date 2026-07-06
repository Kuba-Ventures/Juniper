import { useState } from "react";
import type React from "react";
import type { Plan } from "@/lib/plans";
import { buildProjectionView, type ProjectionView, type SeriesPoint } from "@/lib/projection";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageArea = "rgba(92,122,101,0.12)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 14px",
};

// Chart geometry (viewBox units; the SVG scales to its container width).
const W = 680;
const H = 240;
const PAD = { left: 12, right: 72, top: 22, bottom: 30 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const baselineY = PAD.top + plotH;

export function PlanProjection({
  plan,
  onContributionChange,
}: {
  plan: Plan;
  onContributionChange?: (value: number) => void;
}) {
  const view = buildProjectionView(plan);
  if (!view) return null;

  const xOf = (month: number) => PAD.left + (view.months > 0 ? month / view.months : 0) * plotW;
  const yOf = (v: number) => PAD.top + plotH - (v / view.yMax) * plotH;

  const line = (series: SeriesPoint[]) =>
    series.map((p, idx) => `${idx === 0 ? "M" : "L"} ${xOf(p.month).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(" ");

  const primaryPath = line(view.primary);
  const areaPath = `${primaryPath} L ${xOf(view.months).toFixed(1)} ${baselineY} L ${xOf(0).toFixed(1)} ${baselineY} Z`;
  const start = view.primary[0];
  const end = view.primary[view.primary.length - 1];
  // Start label sits above a low start (savings) and below a high start (debt).
  const startLabelY = view.mode === "debt" ? yOf(start.value) + 16 : yOf(start.value) - 10;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Your projected path</h2>

      <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "18px 18px 14px" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ height: "auto", display: "block", overflow: "visible" }}
          role="img"
          aria-label={`Projected path: ${view.startLabel} toward ${view.targetRefLabel}.`}
        >
          {/* target reference line (savings only) */}
          {view.showTargetLine && (
            <>
              <line
                x1={PAD.left}
                y1={yOf(view.targetValue)}
                x2={PAD.left + plotW}
                y2={yOf(view.targetValue)}
                stroke={muted}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
              <text x={PAD.left + plotW + 6} y={yOf(view.targetValue) + 4} fontFamily={sans} fontSize={12} fontWeight={600} fill={muted}>
                {view.targetRefLabel}
              </text>
            </>
          )}

          {/* primary area + line */}
          <path d={areaPath} fill={sageArea} stroke="none" />
          <path d={primaryPath} fill="none" stroke={sage} strokeWidth={2.5} strokeLinejoin="round" />

          {/* comparison line */}
          {view.compare && (
            <path d={line(view.compare)} fill="none" stroke={muted} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.75} />
          )}

          {/* start point + label */}
          <circle cx={xOf(start.month)} cy={yOf(start.value)} r={4} fill={sage} />
          <text x={xOf(start.month)} y={startLabelY} fontFamily={sans} fontSize={11} fontWeight={600} fill={ink}>
            {view.startLabel}
          </text>

          {/* milestone markers */}
          {view.markers.map((mk) => (
            <g key={mk.label}>
              <circle cx={xOf(mk.month)} cy={yOf(mk.value)} r={3.5} fill="#fff" stroke={sage} strokeWidth={2} />
              <text x={xOf(mk.month)} y={yOf(mk.value) + 18} fontFamily={sans} fontSize={10} fontWeight={600} fill={muted} textAnchor="middle">
                {mk.label}
              </text>
            </g>
          ))}

          {/* end point */}
          <circle cx={xOf(end.month)} cy={yOf(end.value)} r={4} fill={sage} />
          {/* end-of-path label when there's no target line (debt: "Debt-free") */}
          {!view.showTargetLine && (
            <text x={xOf(end.month)} y={yOf(end.value) - 10} fontFamily={sans} fontSize={11} fontWeight={600} fill={sage} textAnchor="end">
              {view.targetRefLabel}
            </text>
          )}

          {/* x-axis labels */}
          <text x={PAD.left} y={H - 8} fontFamily={sans} fontSize={11} fill={muted}>Now</text>
          <text x={PAD.left + plotW} y={H - 8} fontFamily={sans} fontSize={11} fill={muted} textAnchor="end">
            {view.endAxisLabel}
          </text>
        </svg>

        {/* legend */}
        <div style={{ display: "flex", gap: 18, marginTop: 6, flexWrap: "wrap" }}>
          <Legend swatch={<span style={{ width: 14, height: 3, background: sage, borderRadius: 2, display: "inline-block" }} />} label={view.primaryLabel} />
          {view.compareLabel && (
            <Legend swatch={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${muted}`, display: "inline-block" }} />} label={view.compareLabel} />
          )}
        </div>

        {/* readout */}
        <p style={{ fontFamily: sans, fontSize: 13.5, color: ink, lineHeight: 1.55, margin: "14px 0 0" }}>{view.readout}</p>

        {/* editable monthly amount (savings): recomputes the timeline above */}
        {view.editableMonthly != null && onContributionChange && (
          <ContributionField value={view.editableMonthly} onCommit={onContributionChange} />
        )}
      </div>
    </section>
  );
}

function ContributionField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  // Reflect recomputed values from the parent when not actively editing.
  if (!editing && text !== String(value)) setText(String(value));

  const commit = () => {
    setEditing(false);
    const n = parseInt(text.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n) && n !== value) onCommit(n);
    else setText(String(value));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${border}` }}>
      <label style={{ fontFamily: sans, fontSize: 13, color: muted }}>I can save</label>
      <span style={{ display: "inline-flex", alignItems: "baseline", borderBottom: `2px solid ${editing ? sage : border}`, paddingBottom: 1 }}>
        <span style={{ fontFamily: sans, fontSize: 15, color: ink, fontWeight: 600 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={editing ? text : Number(value).toLocaleString("en-US")}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
          onFocus={() => { setEditing(true); setText(String(value)); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          aria-label="Monthly amount"
          style={{
            width: `${Math.max(4, (editing ? text : String(value)).length + 1)}ch`,
            fontFamily: sans, fontSize: 15, fontWeight: 600, color: ink,
            border: "none", outline: "none", background: "transparent", padding: "0 2px",
          }}
        />
      </span>
      <span style={{ fontFamily: sans, fontSize: 13, color: muted }}>/mo</span>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch}
      <span style={{ fontFamily: sans, fontSize: 11.5, color: muted }}>{label}</span>
    </span>
  );
}
