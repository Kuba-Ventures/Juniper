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

export function InlineChart({ spec }: { spec: ChartSpec }) {
  const rechartData = spec.data.map((d) => ({ name: d.label, value: d.value }));

  const tickStyle = { fill: muted, fontSize: 11, fontFamily: sans };

  return (
    <div style={{
      background: "#fff", border: `1px solid ${border}`, borderRadius: 12,
      padding: "20px 20px 16px", margin: "4px 0 8px",
    }}>
      <p style={{
        fontFamily: serif, fontSize: 15, color: ink, margin: "0 0 16px",
        fontWeight: 400, letterSpacing: "-0.01em",
      }}>
        {spec.title}
      </p>

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
  const regex = /\[CHART:([\s\S]*?)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", content: content.slice(lastIndex, match.index) });
    }
    try {
      const spec = JSON.parse(match[1]) as ChartSpec;
      segments.push({ kind: "chart", spec });
    } catch {
      segments.push({ kind: "text", content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  // If there's an incomplete [CHART: at the end (streaming), show placeholder
  const tail = content.slice(lastIndex);
  const partialIdx = tail.indexOf("[CHART:");
  if (partialIdx !== -1) {
    if (partialIdx > 0) segments.push({ kind: "text", content: tail.slice(0, partialIdx) });
    segments.push({ kind: "chart-pending" });
  } else if (tail) {
    segments.push({ kind: "text", content: tail });
  }

  return segments;
}
