import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { LOGOS } from "@/lib/mock-logos";
import { LOGO_KEY, money, type SeriesKey } from "@/lib/mock-data";

export const cssVar = (k: string) => `var(${k})`;

/* ---------- brand logo tile (falls back to a colored monogram) ---------- */
// `k` is a palette token; `paint` is a ready-made colour and wins when given.
// A group the member created has no token, only a generated hue, so the tile
// has to be able to take the finished colour rather than a name to look up.
export function BrandTile({ name, letter, k, paint, big }: {
  name: string; letter: string; k: SeriesKey | string; paint?: string; big?: boolean;
}) {
  const key = LOGO_KEY[name];
  const cls = big ? "blogo-lg" : "blogo";
  if (key && LOGOS[key]) return <img className={cls} src={LOGOS[key]} alt="" />;
  return <div className="tile" style={{ background: paint ?? cssVar(k) }}>{letter}</div>;
}

/* ---------- plan icons ---------- */
const ICONS: Record<string, ReactNode> = {
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /></>,
  debt: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M2.5 10h19" /></>,
  baby: <><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01" /><path d="M9 14.5c1.2 1.2 4.8 1.2 6 0" /></>,
  combine: <><path d="M9.5 8a4 4 0 000 8" /><path d="M14.5 16a4 4 0 000-8" /><path d="M8.5 12h7" /></>,
  wedding: <path d="M12 20s-6.5-4.2-9-8.2A4.5 4.5 0 0112 6a4.5 4.5 0 019 5.8c-2.5 4-9 8.2-9 8.2z" />,
  shield: <path d="M12 3l7 3v6c0 4-3 6.8-7 8-4-1.2-7-4-7-8V6z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
};
export function PlanIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] ?? null}
    </svg>
  );
}
export function planMark(p: { icon?: string; ab: string }) {
  return p.icon && ICONS[p.icon] ? <PlanIcon name={p.icon} /> : <>{p.ab}</>;
}

/* ---------- plan trajectory sparkline ---------- */
export function PlanSpark({ data, k, height = 38 }: { data: number[]; k: string; height?: number }) {
  // viewBox height tracks the render height so the stroke stays crisp (no
  // vertical distortion) as the spark grows. A little top/bottom padding keeps
  // the trend off the edges; the y-range hugs min→max so the shape reads clearly.
  const W = 300, H = height, pad = Math.max(3, Math.round(height * 0.12));
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (data.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / rng) * (H - 2 * pad);
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `M${x(0)} ${y(data[0])} ` + data.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") + ` L${x(data.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`;
  const r = Math.max(3, Math.round(height * 0.06));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", height, overflow: "visible" }}>
      <path d={area} fill={cssVar(k)} opacity={0.1} />
      <path d={line} fill="none" stroke={cssVar(k)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={r} fill={cssVar(k)} stroke="var(--jnpr-surface)" strokeWidth={2} />
    </svg>
  );
}

/* ---------- net-worth area chart with hover ---------- */
export function NetWorthChart({
  series,
  labels,
  estimated,
  height = 150,
}: {
  series: number[];
  labels: string[];
  // Parallel to `series`, true where the point was rebuilt from transactions
  // rather than recorded from a live balance. Those points are drawn dashed and
  // named in a legend, because they are arithmetic on real transactions rather
  // than an observation: the invested part of them carries contributions but not
  // market movement (see api/plaid/networth-backfill.ts). Absent or shorter than
  // the series means "all recorded", which is every member who linked before the
  // backfill existed.
  estimated?: boolean[];
  height?: number;
}) {
  const W = 560, H = height, padL = 6, padR = 6, padT = 12, padB = 18;
  const n = series.length;
  // Three shapes this has to survive, all of them now reachable. A ONE-POINT
  // series: net_worth_snapshots holds one row per day, so a member who linked
  // this morning has exactly one, and the range pills above can select a single
  // day. A DEAD FLAT series: a manual or empty dashboard has no history, so
  // every point is the current value. A NEGATIVE series: net worth below zero.
  // The old arithmetic divided by `n - 1` and scaled the bounds by 0.985/1.01,
  // which gave NaN for the first two and inverted bounds for the third, and it
  // was only safe while the numbers came from a demo household with twelve
  // rising positive points.
  const minV = Math.min(...series), maxV = Math.max(...series);
  const spread = maxV - minV;
  // A flat series has to have bounds invented around it or every point lands on
  // one row of pixels; a series with real spread just gets breathing room so the
  // extremes are not flush against the frame.
  const pad = spread > 0 ? spread * 0.06 : (Math.abs(maxV) || 1000) * 0.08;
  const min = minV - pad, max = maxV + pad;
  // A single point sits in the middle of the plot rather than pinned to the left
  // edge, where it reads as the start of a line that never got drawn.
  const x = (i: number) => (n > 1 ? padL + (i * (W - padL - padR)) / (n - 1) : padL + (W - padL - padR) / 2);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  // The reconstructed run is a prefix: the backfill only ever writes days BEFORE
  // the first recorded snapshot, and it never overwrites a recorded one. So the
  // split is the last estimated index, and the two paths share that point rather
  // than meeting at a gap.
  const lastEst = series.reduce((acc, _v, i) => (estimated?.[i] === true ? i : acc), -1);
  const hasEst = lastEst >= 0 && lastEst < n - 1;
  const seg = (from: number, to: number) =>
    series.slice(from, to + 1).map((v, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `M${x(0)} ${y(series[0])} ` + series.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") + ` L${x(n - 1)} ${H - padB} L${x(0)} ${H - padB} Z`;
  const grid = [0, 0.5, 1].map((f) => padT + f * (H - padT - padB));
  // Derived from the series length instead of the old fixed [0,3,6,9,11], which
  // assumed twelve points and printed blanks for any shorter window. Runs of
  // daily snapshots share a month label, so a tick repeating the one before it is
  // dropped: a 30-day window gets one "Aug", not five.
  const ticks = (n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))) : [0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter((v, i, a) => i === 0 || labels[v] !== labels[a[i - 1]]);
  const ref = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });

  const onMove = (e: ReactPointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ w: r.width, h: r.height });
    let i = n > 1 ? Math.round(((e.clientX - r.left) / r.width * W - padL) / ((W - padL - padR) / (n - 1))) : 0;
    i = Math.max(0, Math.min(n - 1, i));
    setHi(i);
  };

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        {grid.map((gy, i) => <line key={i} className="nw-grid" x1={padL} x2={W - padR} y1={gy} y2={gy} />)}
        <path className="nw-area" d={area} />
        {hasEst ? (
          <>
            <path className="nw-line nw-line-est" d={seg(0, lastEst)} />
            <path className="nw-line" d={seg(lastEst, n - 1)} />
          </>
        ) : (
          <path className="nw-line" d={line} />
        )}
        {hi != null && <line className="nw-grid" x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} style={{ stroke: "var(--jnpr-ink-3)", opacity: 0.5, strokeDasharray: "none" }} />}
        {hi != null && <circle className="nw-dot" cx={x(hi)} cy={y(series[hi])} r={4} />}
        <circle className="nw-dot" cx={x(n - 1)} cy={y(series[n - 1])} r={4} />
        {ticks.map((i) => <text key={i} className="ax" x={x(i)} y={H - 5} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{labels[i] ?? ""}</text>)}
      </svg>
      {hi != null && rect.w > 0 && (
        <div className="jnpr-tip" style={{ left: (x(hi) / W) * rect.w, top: (y(series[hi]) / H) * rect.h - 6 }}>
          {labels[hi]} · <span className="tv tnum">{money(series[hi])}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- spending donut + legend with hover ---------- */
// A group the member created has no palette token, only a generated hue, so a
// wedge is painted from whichever the row carries.
const paintOf = (d: { k: SeriesKey; hue?: number | null }) =>
  d.hue == null ? cssVar(d.k) : `hsl(${d.hue} var(--jnpr-gen-s) var(--jnpr-gen-l))`;

// The wedges take `k`, the colour, because that is what an arc can be filled
// with. The legend beside them takes `e`, the icon, because that is what reads
// in a list. Both, not one instead of the other.
export function SpendingDonut({ data }: { data: { c: string; v: number; k: SeriesKey; e?: string; hue?: number | null }[] }) {
  const total = data.reduce((a, b) => a + b.v, 0);
  const S = 170, cx = S / 2, cy = S / 2, rO = 78, rI = 50;
  const pol = (r: number, a: number): [number, number] => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  let ang = -90;
  const slices = data.map((d) => {
    const sweep = (d.v / total) * 360, a0 = ang, a1 = ang + sweep; ang = a1;
    const [x1, y1] = pol(rO, a0), [x2, y2] = pol(rO, a1), [x3, y3] = pol(rI, a1), [x4, y4] = pol(rI, a0);
    const lg = sweep > 180 ? 1 : 0;
    return { d, path: `M${x1} ${y1} A${rO} ${rO} 0 ${lg} 1 ${x2} ${y2} L${x3} ${y3} A${rI} ${rI} 0 ${lg} 0 ${x4} ${y4} Z` };
  });
  const [hi, setHi] = useState<number | null>(null);
  return (
    <div className="donut-wrap">
      <div className="chart" style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${S} ${S}`} width={170} height={170} style={{ display: "block" }}>
          {slices.map((s, i) => (
            <path key={i} className="slice" d={s.path} fill={paintOf(s.d)}
              style={{ opacity: hi == null || hi === i ? 1 : 0.4 }}
              onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} />
          ))}
        </svg>
        <div className="donut-center"><span className="dt">Spent</span><span className="dv tnum">{money(total)}</span></div>
      </div>
      <div className="legend">
        {data.map((d, i) => (
          <div className="lg" key={i} onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)}>
            <span className="sw" style={{ background: paintOf(d) }} />
            <span className="ln"><span className="cat-em" aria-hidden>{d.e}</span>{d.c}</span>
            <span className="lv tnum">{money(d.v)}</span>
            <span className="lp tnum">{Math.round((d.v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- score ring ---------- */
export function MiniRing({ score, d = 46, pending = false }: { score: number; d?: number; pending?: boolean }) {
  const r = (d - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100), cx = d / 2;
  // Sized inline from `d` rather than trusting the class's own 46px, which is
  // right only for the default: a caller drawing a bigger ring (the Overview's
  // "Ring" size, issue #259, wants the same visual weight the spending donut
  // has) needs the wrapper and the number both to scale with it, not just the
  // svg inside a fixed box. The ratio is the current fixed 15px read against
  // the default 46px, so nothing changes for an existing caller.
  const fontSize = Math.max(11, Math.round(d * (15 / 46)));
  return (
    <div className="mini-ring" style={{ width: d, height: d }}>
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--jnpr-surface-3)" strokeWidth={5} />
        {/* NO ARC WHILE PENDING. An arc is a quantity: any length at all states a
            score, and the one number we must not state yet is a score. The track
            alone reads as a ring waiting to be filled. */}
        {!pending && (
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--jnpr-good)" strokeWidth={5} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${cx} ${cx})`} />
        )}
      </svg>
      <span className={pending ? "rv tnum pending" : "rv tnum"} style={{ fontSize }}>{pending ? SCORE_DASH : score}</span>
    </div>
  );
}

/**
 * What stands in for a score that is not known yet.
 *
 * Exported so every surface that withholds one writes the same character, and so
 * a reader grepping for it finds all of them at once. Two en dashes rather than
 * an em dash, per the house rule, and rather than "--", which reads as a typo at
 * the size the score is set in.
 */
export const SCORE_DASH = "\u2013\u2013";
