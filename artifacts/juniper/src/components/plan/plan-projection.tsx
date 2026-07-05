import type React from "react";
import type { Plan } from "@/lib/plans";
import { planProjectionInput, projectSavings } from "@/lib/projection";

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

// Full-precision money ($1,621 / $200,000).
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
// Compact money for tight chart labels ($200K / $1.2M).
function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}
function monthLabel(ym?: string): string {
  if (!ym) return "target";
  const [y, m] = ym.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return "target";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Chart geometry (viewBox units; the SVG scales to its container width).
const W = 680;
const H = 240;
const PAD = { left: 12, right: 72, top: 18, bottom: 30 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const baselineY = PAD.top + plotH;

export function PlanProjection({ plan }: { plan: Plan }) {
  const input = planProjectionInput(plan);
  if (!input) return null;

  const proj = projectSavings(input.current, input.target, input.months, input.apy);
  const alreadyThere = input.current >= input.target;

  const yMax = Math.max(input.target * 1.08, proj.finalBalance * 1.02, 1);
  const xOf = (month: number) => PAD.left + (proj.months > 0 ? month / proj.months : 0) * plotW;
  const yOf = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const linePath = (key: "balance" | "principal") =>
    proj.series
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${xOf(p.month).toFixed(1)} ${yOf(p[key]).toFixed(1)}`)
      .join(" ");

  const balancePath = linePath("balance");
  const areaPath = `${balancePath} L ${xOf(proj.months).toFixed(1)} ${baselineY} L ${xOf(0).toFixed(1)} ${baselineY} Z`;
  const targetY = yOf(input.target);
  const apyPct = `${(input.apy * 100).toFixed(1)}%`;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Your projected path</h2>

      <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "18px 18px 14px" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ height: "auto", display: "block", overflow: "visible" }}
          role="img"
          aria-label={`Projected savings from ${money(input.current)} now to ${money(input.target)} by ${monthLabel(input.targetDate)}, assuming ${apyPct} APY.`}
        >
          {/* target reference line */}
          <line x1={PAD.left} y1={targetY} x2={PAD.left + plotW} y2={targetY} stroke={muted} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
          <text x={PAD.left + plotW + 6} y={targetY + 4} fontFamily={sans} fontSize={12} fontWeight={600} fill={muted}>
            {moneyShort(input.target)}
          </text>

          {/* balance area + line (with interest) */}
          <path d={areaPath} fill={sageArea} stroke="none" />
          <path d={balancePath} fill="none" stroke={sage} strokeWidth={2.5} strokeLinejoin="round" />

          {/* contributions-only line (no interest), for contrast */}
          <path d={linePath("principal")} fill="none" stroke={muted} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.75} />

          {/* start point */}
          <circle cx={xOf(0)} cy={yOf(input.current)} r={4} fill={sage} />
          <text x={xOf(0)} y={yOf(input.current) - 10} fontFamily={sans} fontSize={11} fontWeight={600} fill={ink}>
            {moneyShort(input.current)} now
          </text>

          {/* milestone markers along the way */}
          {proj.markers.map((mk) => (
            <g key={mk.pct}>
              <circle cx={xOf(mk.month)} cy={yOf(mk.balance)} r={3.5} fill="#fff" stroke={sage} strokeWidth={2} />
              <text x={xOf(mk.month)} y={yOf(mk.balance) + 18} fontFamily={sans} fontSize={10} fontWeight={600} fill={muted} textAnchor="middle">
                {mk.pct}%
              </text>
            </g>
          ))}

          {/* end point */}
          <circle cx={xOf(proj.months)} cy={yOf(proj.finalBalance)} r={4} fill={sage} />

          {/* x-axis labels */}
          <text x={PAD.left} y={H - 8} fontFamily={sans} fontSize={11} fill={muted}>Now</text>
          <text x={PAD.left + plotW} y={H - 8} fontFamily={sans} fontSize={11} fill={muted} textAnchor="end">
            {monthLabel(input.targetDate)}
          </text>
        </svg>

        {/* legend */}
        <div style={{ display: "flex", gap: 18, marginTop: 6, flexWrap: "wrap" }}>
          <Legend swatch={<span style={{ width: 14, height: 3, background: sage, borderRadius: 2, display: "inline-block" }} />} label={`With ${apyPct} APY`} />
          <Legend swatch={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${muted}`, display: "inline-block" }} />} label="Contributions only" />
        </div>

        {/* interest-aware readout */}
        <p style={{ fontFamily: sans, fontSize: 13.5, color: ink, lineHeight: 1.55, margin: "14px 0 0" }}>
          {alreadyThere ? (
            <>You're already at your {money(input.target)} target. Keeping it in {input.vehicle} at {apyPct} APY grows it further while you shop.</>
          ) : (
            <>
              Saving about <strong>{money(proj.monthlyContribution)}/mo</strong> in {input.vehicle} ({apyPct} APY)
              reaches your {money(input.target)} target by {monthLabel(input.targetDate)}. Interest earns roughly{" "}
              {money(Math.round(proj.interestEarned / 100) * 100)} of that, so you set aside less than the{" "}
              {money(proj.monthlyNoInterest)}/mo a plain account would need.
            </>
          )}
        </p>
      </div>
    </section>
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
