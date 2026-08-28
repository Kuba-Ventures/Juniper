// The five spending views behind the transactions tab's chart switcher.
// All plain SVG built from the same `breakdown` array, no charting dependency:
// the bundle is already 973kB and a library would earn its weight only if these
// needed axes, zoom, or animation, which none of them do.
//
// Each view answers a different question, which is why they are not skins of one
// chart. Pie: what is the shape of the month. Breakdown: what is biggest.
// Treemap: how do the small categories compare to each other, which a donut's
// slivers cannot show. Trend: is this normal for me. Flow: where did the money
// come from and where did it end up.
//
// One rule across all five: nothing is drawn from a total the server did not
// send. `spent` is defined server-side as the sum of the breakdown, so the
// center of the donut, the end of the bars, and the width of the flow all
// resolve to the same figure by construction rather than by three roundings
// that happen to agree.
import { useState, type ReactNode } from "react";
import { cssVar } from "@/components/juniper/primitives";
import { colorOf } from "@/lib/category-color";
import { fmtMonth, money0 } from "@/lib/txn-format";
import type { BreakdownRow } from "@/lib/transactions";

export type ChartKind = "pie" | "bars" | "treemap" | "trend" | "flow";

// The switcher copy names what each view is FOR, not what shape it is. A member
// choosing between "Pie" and "Treemap" is choosing between two words for a
// picture; choosing between "at a glance" and "how the small ones compare" is
// choosing an answer.
export const CHART_KINDS: { k: ChartKind; label: string; hint: string }[] = [
  { k: "pie", label: "Pie", hint: "Your spending breakdown at a glance" },
  { k: "bars", label: "Breakdown", hint: "Categories, biggest to smallest" },
  { k: "treemap", label: "Treemap", hint: "Proportional, small categories included" },
  { k: "trend", label: "Trend", hint: "How your spending moved over time" },
  { k: "flow", label: "Flow", hint: "Where money came in and where it went" },
];

const pct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

/* ---------- pie ---------- */
export function PieView({ rows, total, hi, onHi }: ViewProps) {
  const S = 210, c = S / 2, rO = 96, rI = 62;
  const pol = (r: number, a: number): [number, number] => [c + r * Math.cos((a * Math.PI) / 180), c + r * Math.sin((a * Math.PI) / 180)];
  let ang = -90;
  const slices = rows.map((d) => {
    const sweep = (d.v / (total || 1)) * 360, a0 = ang, a1 = ang + sweep;
    ang = a1;
    const [x1, y1] = pol(rO, a0), [x2, y2] = pol(rO, a1), [x3, y3] = pol(rI, a1), [x4, y4] = pol(rI, a0);
    const lg = sweep > 180 ? 1 : 0;
    // A single category is a full circle, which an arc path cannot express (the
    // start and end points coincide, so the arc collapses to nothing). Two
    // half-arcs draw the ring instead.
    const path = sweep >= 359.99
      ? `M${c - rO} ${c} A${rO} ${rO} 0 1 1 ${c + rO} ${c} A${rO} ${rO} 0 1 1 ${c - rO} ${c} M${c - rI} ${c} A${rI} ${rI} 0 1 0 ${c + rI} ${c} A${rI} ${rI} 0 1 0 ${c - rI} ${c} Z`
      : `M${x1} ${y1} A${rO} ${rO} 0 ${lg} 1 ${x2} ${y2} L${x3} ${y3} A${rI} ${rI} 0 ${lg} 0 ${x4} ${y4} Z`;
    return { d, path };
  });
  const shown = hi != null ? rows[hi] : null;
  return (
    <div className="sc-pie">
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} className="sc-svg" role="img" aria-label="Spending by category">
        {slices.map((s, i) => (
          <path key={s.d.c} d={s.path} fill={cssVar(colorOf(s.d.c))} fillRule="evenodd"
            style={{ opacity: hi == null || hi === i ? 1 : 0.35, cursor: "pointer" }}
            onPointerEnter={() => onHi(i)} onPointerLeave={() => onHi(null)} />
        ))}
        <text x={c} y={c - 2} textAnchor="middle" className="sc-cv">{money0(shown ? shown.v : total)}</text>
        <text x={c} y={c + 16} textAnchor="middle" className="sc-cl">{shown ? shown.c : "spent"}</text>
      </svg>
    </div>
  );
}

/* ---------- horizontal bars ---------- */
export function BarsView({ rows, total, hi, onHi }: ViewProps) {
  const max = rows.reduce((a, r) => Math.max(a, r.v), 0) || 1;
  return (
    <div className="sc-bars">
      {rows.map((r, i) => (
        <div key={r.c} className={`sc-bar${hi === i ? " on" : ""}`}
          onPointerEnter={() => onHi(i)} onPointerLeave={() => onHi(null)}>
          <div className="sc-bar-h">
            <span className="sc-bar-n">{r.c}</span>
            <span className="sc-bar-v tnum">{money0(r.v)}</span>
            <span className="sc-bar-p tnum">{pct(r.v, total).toFixed(1)}%</span>
          </div>
          {/* Bars are scaled against the LARGEST category, not the total, so the
             shape of the ranking stays readable when one category dominates.
             The percentage beside it is against the total, which is the figure
             that answers "how much of my month was this". */}
          <div className="sc-bar-t"><div className="sc-bar-f" style={{ width: `${(r.v / max) * 100}%`, background: cssVar(colorOf(r.c)) }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- treemap ---------- */
type Rect = { x: number; y: number; w: number; h: number };

// Squarified treemap (Bruls, Huizing, van Wijk). The naive alternative, slicing
// the rectangle in order, produces slivers for the small categories, which is
// exactly the comparison this view exists to make.
function squarify(vals: number[], box: Rect): Rect[] {
  const out: Rect[] = vals.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  let { x, y, w, h } = box;
  let remaining = vals.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < vals.length && w > 0.01 && h > 0.01 && remaining > 0) {
    const vertical = w >= h;          // wide box: cut a vertical strip off the left
    const side = vertical ? h : w;
    const scale = (w * h) / remaining;
    let row: number[] = [];
    let rowSum = 0;
    let best = Infinity;
    let j = i;
    while (j < vals.length) {
      const cand = [...row, vals[j]];
      const sum = rowSum + vals[j];
      const thickness = (sum * scale) / side;
      // Worst aspect ratio in the candidate row. Growing the row is only worth
      // it while that worst case keeps improving.
      const worst = cand.reduce((acc, v) => {
        const extent = (v * scale) / thickness;
        return Math.max(acc, Math.max(thickness / extent, extent / thickness));
      }, 0);
      if (worst > best) break;
      best = worst; row = cand; rowSum = sum; j++;
    }
    if (!row.length) break;
    const thickness = (rowSum * scale) / side;
    let off = 0;
    for (let k = 0; k < row.length; k++) {
      const extent = (row[k] * scale) / thickness;
      out[i + k] = vertical ? { x, y: y + off, w: thickness, h: extent } : { x: x + off, y, w: extent, h: thickness };
      off += extent;
    }
    if (vertical) { x += thickness; w -= thickness; } else { y += thickness; h -= thickness; }
    remaining -= rowSum;
    i += row.length;
  }
  return out;
}

export function TreemapView({ rows, total, hi, onHi }: ViewProps) {
  const W = 720, H = 300;
  const rects = squarify(rows.map((r) => r.v), { x: 0, y: 0, w: W, h: H });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: `${W} / ${H}` }} className="sc-svg sc-wide sc-tm" role="img" aria-label="Spending by category, proportional">
      {rows.map((r, i) => {
        const b = rects[i];
        if (b.w < 1 || b.h < 1) return null;
        // Labels only where they fit, measured against the label that actually
        // has to go in the tile rather than one width for every category. A
        // fixed threshold let "Kids & health" into a tile too narrow for it and
        // the name ran over the edge; roughly 6.2px per character at 12px is the
        // approximation that holds for these names.
        const need = 20 + r.c.length * 6.2;
        const room = b.w > need && b.h > 34;
        const tight = b.w > 52 && b.h > 22;
        return (
          <g key={r.c} onPointerEnter={() => onHi(i)} onPointerLeave={() => onHi(null)} style={{ cursor: "pointer" }}>
            <rect x={b.x + 1} y={b.y + 1} width={Math.max(0, b.w - 2)} height={Math.max(0, b.h - 2)} rx={6}
              fill={cssVar(colorOf(r.c))} style={{ opacity: hi == null || hi === i ? 1 : 0.35 }} />
            {room && <text className="sc-tm-n" x={b.x + 10} y={b.y + 21}>{r.c}</text>}
            {room && <text className="sc-tm-v" x={b.x + 10} y={b.y + 37}>{money0(r.v)} · {pct(r.v, total).toFixed(0)}%</text>}
            {!room && tight && <text className="sc-tm-v" x={b.x + 8} y={b.y + 16}>{money0(r.v)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- trend bars ---------- */
export function TrendView({ trend }: { trend: { ym: string; spent: number; income: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  if (!trend.length) return <Empty>Not enough history yet to show a trend.</Empty>;
  const W = 720, H = 260, padB = 30, padT = 22, padL = 4;
  const max = trend.reduce((a, t) => Math.max(a, t.spent, t.income), 0) || 1;
  const slot = (W - padL * 2) / trend.length;
  const bw = Math.min(30, slot * 0.32);
  const yOf = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  // The average line is drawn across the months PRESENT, so a member with four
  // months of history sees the average of four months. Averaging over a fixed
  // twelve would flatter every short history by dividing by months that do not
  // exist.
  const avg = trend.reduce((a, t) => a + t.spent, 0) / trend.length;
  return (
    <div className="sc-trend">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: `${W} / ${H}` }} className="sc-svg sc-wide" role="img" aria-label="Spending and income by month">
        <line className="sc-avg" x1={padL} x2={W - padL} y1={yOf(avg)} y2={yOf(avg)} />
        <text className="sc-avg-l" x={W - padL} y={yOf(avg) - 5} textAnchor="end">avg {money0(avg)}</text>
        {trend.map((t, i) => {
          const cx = padL + slot * i + slot / 2;
          const on = hi == null || hi === i;
          return (
            <g key={t.ym} onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} style={{ cursor: "pointer" }}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              <rect className="sc-tb-in" x={cx - bw - 2} y={yOf(t.income)} width={bw} height={Math.max(1, H - padB - yOf(t.income))} rx={4} style={{ opacity: on ? 1 : 0.35 }} />
              <rect className="sc-tb-out" x={cx + 2} y={yOf(t.spent)} width={bw} height={Math.max(1, H - padB - yOf(t.spent))} rx={4} style={{ opacity: on ? 1 : 0.35 }} />
              <text className="sc-ax" x={cx} y={H - 10} textAnchor="middle">{fmtMonth(t.ym)}</text>
              {hi === i && <text className="sc-tb-v" x={cx} y={Math.min(yOf(t.income), yOf(t.spent)) - 7} textAnchor="middle">{money0(t.spent)} out · {money0(t.income)} in</text>}
            </g>
          );
        })}
      </svg>
      <div className="sc-key">
        <span><i className="sc-key-in" />Money in</span>
        <span><i className="sc-key-out" />Spent</span>
      </div>
    </div>
  );
}

/* ---------- flow ---------- */
export function FlowView({ rows, total, income, incomeRows }: {
  rows: BreakdownRow[]; total: number; income: number; incomeRows: { c: string; v: number }[];
}) {
  const W = 720, padT = 14, gap = 8;
  // The band is as tall as the LARGER side. When spending exceeds income the
  // difference came out of savings and is drawn as an inflow, because money
  // that left an account has to have arrived from somewhere and a flow diagram
  // that does not balance is just a picture.
  const leftOver = Math.max(0, income - total);
  const drawn = Math.max(income, total, 1);
  const fromSavings = Math.max(0, total - income);

  const ins = [...incomeRows.map((r) => ({ c: r.c, v: r.v, k: colorOf("Income") })), ...(fromSavings > 0 ? [{ c: "From savings", v: fromSavings, k: colorOf("Transfers & payments") }] : [])];
  const outs = [...rows.map((r) => ({ c: r.c, v: r.v, k: colorOf(r.c) })), ...(leftOver > 0 ? [{ c: "Left over", v: leftOver, k: colorOf("Income") }] : [])];
  if (!ins.length && !outs.length) return <Empty>Nothing to chart in this range yet.</Empty>;

  // Tall enough for the node stack AND for one decluttered label per node.
  const H = Math.max(240, Math.max(ins.length, outs.length) * 34 + padT * 2);
  const bodyH = H - padT * 2;
  const scale = (bodyH - gap * Math.max(0, Math.max(ins.length, outs.length) - 1)) / drawn;
  const nodeW = 11, hubX = W / 2 - nodeW / 2, leftX = 0, rightX = W - nodeW;

  const stack = (arr: { c: string; v: number; k: string }[]) => {
    let y = padT;
    return arr.map((n) => { const h = Math.max(3, n.v * scale); const r = { ...n, y, h }; y += h + gap; return r; });
  };
  const L = stack(ins), R = stack(outs);

  // Labels are centered on their node, and a node worth $74 next to one worth
  // $118 is a few pixels tall, so those two labels landed on top of each other
  // and neither could be read. Walk each column top to bottom and push any
  // label that crowds the one above it down to a minimum spacing. The label
  // drifts off its node's exact center, which is the correct trade: the node is
  // still the nearest one, and an unreadable label is worth nothing.
  const LABEL_GAP = 13;
  const labelYs = (arr: { y: number; h: number }[]) => {
    const ys = arr.map((n) => n.y + n.h / 2 + 4);
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < LABEL_GAP) ys[i] = ys[i - 1] + LABEL_GAP;
    return ys;
  };
  const LY = labelYs(L), RY = labelYs(R);

  // The hub is one continuous node, so the ribbons meeting it stack without the
  // gaps the end columns use.
  let hy = padT;
  const hubIn = L.map((n) => { const h = n.v * scale; const r = { y: hy, h }; hy += h; return r; });
  hy = padT;
  const hubOut = R.map((n) => { const h = n.v * scale; const r = { y: hy, h }; hy += h; return r; });
  const hubH = Math.max(hubIn.reduce((a, b) => a + b.h, 0), hubOut.reduce((a, b) => a + b.h, 0));

  const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1} L${x1} ${y1 + h1} C${mx} ${y1 + h1} ${mx} ${y0 + h0} ${x0} ${y0 + h0} Z`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: `${W} / ${H}` }} className="sc-svg sc-wide sc-flow" role="img" aria-label="Money in and where it went">
      {L.map((n, i) => (
        <path key={`li${n.c}`} className="sc-rib" d={ribbon(leftX + nodeW, n.y, n.h, hubX, hubIn[i].y, hubIn[i].h)} fill={cssVar(n.k)} />
      ))}
      {R.map((n, i) => (
        <path key={`ro${n.c}`} className="sc-rib" d={ribbon(hubX + nodeW, hubOut[i].y, hubOut[i].h, rightX, n.y, n.h)} fill={cssVar(n.k)} />
      ))}
      <rect x={hubX} y={padT} width={nodeW} height={Math.max(2, hubH)} rx={3} className="sc-hub" />
      {L.map((n, i) => (
        <g key={`ln${n.c}`}>
          <rect x={leftX} y={n.y} width={nodeW} height={n.h} rx={3} fill={cssVar(n.k)} />
          <text className="sc-fl-n" x={leftX + nodeW + 8} y={LY[i]}>{n.c} · {money0(n.v)}</text>
        </g>
      ))}
      {R.map((n, i) => (
        <g key={`rn${n.c}`}>
          <rect x={rightX} y={n.y} width={nodeW} height={n.h} rx={3} fill={cssVar(n.k)} />
          <text className="sc-fl-n" x={rightX - 8} y={RY[i]} textAnchor="end">{n.c} · {money0(n.v)}</text>
        </g>
      ))}
    </svg>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="sc-empty">{children}</div>;
}

interface ViewProps {
  rows: BreakdownRow[];
  total: number;
  hi: number | null;
  onHi: (i: number | null) => void;
}
