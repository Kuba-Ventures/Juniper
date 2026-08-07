import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sans = "'Inter', sans-serif";
const serif = "'Fraunces', Georgia, serif";

const PALETTE = [
  "#5C7A65", "#8BA897", "#A8C5B0", "#3D5C47",
  "#BFD4C3", "#2A4433", "#D4E6D8", "#7A9E84",
];

export type ChartSpec = {
  type: "bar" | "line" | "pie";
  title: string;
  data: Array<{ label: string; value: number }>;
  unit?: string;
};

function formatValue(value: number, unit?: string) {
  if (unit === "$") return `$${value.toLocaleString()}`;
  if (unit === "%") return `${value}%`;
  return value.toLocaleString();
}

function CustomTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${border}`, borderRadius: 8,
      padding: "8px 12px", fontSize: 13, fontFamily: sans,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ color: muted, margin: "0 0 2px", fontSize: 11 }}>{label}</p>
      <p style={{ color: ink, margin: 0, fontWeight: 600 }}>{formatValue(payload[0].value, unit)}</p>
    </div>
  );
}

function PieTooltip({ active, payload, unit }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${border}`, borderRadius: 8,
      padding: "8px 12px", fontSize: 13, fontFamily: sans,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ color: muted, margin: "0 0 2px", fontSize: 11 }}>{payload[0].name}</p>
      <p style={{ color: ink, margin: 0, fontWeight: 600 }}>{formatValue(payload[0].value, unit)}</p>
    </div>
  );
}

export function InlineChart({ spec, onSave, saved }: {
  spec: ChartSpec;
  onSave?: () => void;
  saved?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const rechartData = spec.data.map((d) => ({ name: d.label, value: d.value }));

  const tickStyle = { fill: muted, fontSize: 11, fontFamily: sans };

  return (
    <div style={{
      background: "#fff", border: `1px solid ${border}`, borderRadius: 12,
      padding: "20px 20px 16px", margin: "4px 0 8px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <p style={{
          fontFamily: serif, fontSize: 15, color: ink, margin: 0,
          fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.4,
        }}>
          {spec.title}
        </p>

        {onSave && (
          <button
            onClick={saved ? undefined : onSave}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={saved ? "Saved to My Plan" : "Save to My Plan"}
            style={{
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: 5,
              background: saved ? "rgba(92,122,101,0.08)" : hovered ? "rgba(92,122,101,0.08)" : "transparent",
              border: `1px solid ${saved ? sage : hovered ? sage : border}`,
              borderRadius: 6, padding: "4px 10px",
              fontSize: 12, color: saved ? sage : hovered ? sage : muted,
              cursor: saved ? "default" : "pointer",
              fontFamily: sans, fontWeight: 500,
              transition: "all 0.15s",
            }}
          >
            {saved
              ? <BookmarkCheck size={12} strokeWidth={2} />
              : <Bookmark size={12} strokeWidth={2} />
            }
            {saved ? "Saved" : "Save to My Plan"}
          </button>
        )}
      </div>

      {spec.type === "bar" && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rechartData} barSize={28} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={border} />
            <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false}
              tickFormatter={(v) => spec.unit === "$" ? `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}` : `${v}${spec.unit || ""}`}
            />
            <Tooltip content={<CustomTooltip unit={spec.unit} />} cursor={{ fill: "rgba(92,122,101,0.06)" }} />
            <Bar dataKey="value" fill={sage} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {spec.type === "line" && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rechartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={border} />
            <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false}
              tickFormatter={(v) => spec.unit === "$" ? `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}` : `${v}${spec.unit || ""}`}
            />
            <Tooltip content={<CustomTooltip unit={spec.unit} />} cursor={{ stroke: border }} />
            <Line
              type="monotone" dataKey="value" stroke={sage} strokeWidth={2.5}
              dot={{ fill: sage, strokeWidth: 0, r: 4 }}
              activeDot={{ fill: sage, strokeWidth: 0, r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {spec.type === "pie" && (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={rechartData} dataKey="value" nameKey="name"
              cx="50%" cy="50%" outerRadius={90} innerRadius={40}
              paddingAngle={2}
            >
              {rechartData.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip unit={spec.unit} />} />
            <Legend
              iconType="circle" iconSize={8}
              formatter={(value) => (
                <span style={{ fontSize: 12, color: muted, fontFamily: sans }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Parse message content into segments of text and chart specs.
export type Segment =
  | { kind: "text"; content: string }
  | { kind: "chart"; spec: ChartSpec }
  | { kind: "chart-pending" };

export function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const marker = "[CHART:";
  let i = 0;

  while (i < content.length) {
    const start = content.indexOf(marker, i);
    if (start === -1) {
      // No more chart tokens, remainder is plain text
      if (i < content.length) segments.push({ kind: "text", content: content.slice(i) });
      break;
    }

    // Text before this token
    if (start > i) segments.push({ kind: "text", content: content.slice(i, start) });

    // Walk forward counting brackets to find the matching closing ]
    // depth starts at 1 for the opening [ of [CHART:
    let depth = 0;
    let j = start;
    let closed = -1;
    while (j < content.length) {
      const ch = content[j];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) { closed = j; break; }
      }
      j++;
    }

    if (closed === -1) {
      // Still streaming, incomplete token
      segments.push({ kind: "chart-pending" });
      break;
    }

    // Extract the JSON between [CHART: and the outer ]
    const jsonStr = content.slice(start + marker.length, closed);
    try {
      const spec = JSON.parse(jsonStr) as ChartSpec;
      segments.push({ kind: "chart", spec });
    } catch {
      // Malformed, emit raw text so nothing is silently swallowed
      segments.push({ kind: "text", content: content.slice(start, closed + 1) });
    }
    i = closed + 1;
  }

  return segments;
}
