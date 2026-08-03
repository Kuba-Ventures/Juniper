import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { LOGOS } from "@/lib/mock-logos";
import { LOGO_KEY, money, type SeriesKey } from "@/lib/mock-data";

export const cssVar = (k: string) => `var(${k})`;

/* ---------- brand logo tile (falls back to a colored monogram) ---------- */
export function BrandTile({ name, letter, k, big }: { name: string; letter: string; k: SeriesKey | string; big?: boolean }) {
  const key = LOGO_KEY[name];
  const cls = big ? "blogo-lg" : "blogo";
  if (key && LOGOS[key]) return <img className={cls} src={LOGOS[key]} alt="" />;
  return <div className="tile" style={{ background: cssVar(k) }}>{letter}</div>;
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

/* ---------- net-worth area chart with hover ---------- */
export function NetWorthChart({ series, labels, height = 150 }: { series: number[]; labels: string[]; height?: number }) {
  const W = 560, H = height, padL = 6, padR = 6, padT = 12, padB = 18;
  const min = Math.min(...series) * 0.985, max = Math.max(...series) * 1.01;
  const x = (i: number) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `M${x(0)} ${y(series[0])} ` + series.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") + ` L${x(series.length - 1)} ${H - padB} L${x(0)} ${H - padB} Z`;
  const grid = [0, 0.5, 1].map((f) => padT + f * (H - padT - padB));
  const ticks = [0, 3, 6, 9, 11];
  const ref = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });

  const onMove = (e: ReactPointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ w: r.width, h: r.height });
    let i = Math.round(((e.clientX - r.left) / r.width * W - padL) / ((W - padL - padR) / (series.length - 1)));
    i = Math.max(0, Math.min(series.length - 1, i));
    setHi(i);
  };

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        {grid.map((gy, i) => <line key={i} className="nw-grid" x1={padL} x2={W - padR} y1={gy} y2={gy} />)}
        <path className="nw-area" d={area} />
        <path className="nw-line" d={line} />
        {hi != null && <line className="nw-grid" x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} style={{ stroke: "var(--jnpr-ink-3)", opacity: 0.5, strokeDasharray: "none" }} />}
        {hi != null && <circle className="nw-dot" cx={x(hi)} cy={y(series[hi])} r={4} />}
        <circle className="nw-dot" cx={x(series.length - 1)} cy={y(series[series.length - 1])} r={4} />
        {ticks.map((i) => <text key={i} className="ax" x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === 11 ? "end" : "middle"}>{labels[i]}</text>)}
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
export function SpendingDonut({ data }: { data: { c: string; v: number; k: SeriesKey }[] }) {
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
            <path key={i} className="slice" d={s.path} fill={cssVar(s.d.k)}
              style={{ opacity: hi == null || hi === i ? 1 : 0.4 }}
              onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} />
          ))}
        </svg>
        <div className="donut-center"><span className="dt">Spent</span><span className="dv tnum">{money(total)}</span></div>
      </div>
      <div className="legend">
        {data.map((d, i) => (
          <div className="lg" key={i} onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)}>
            <span className="sw" style={{ background: cssVar(d.k) }} />
            <span className="ln">{d.c}</span>
            <span className="lv tnum">{money(d.v)}</span>
            <span className="lp tnum">{Math.round((d.v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- score ring ---------- */
export function MiniRing({ score, d = 46 }: { score: number; d?: number }) {
  const r = (d - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100), cx = d / 2;
  return (
    <div className="mini-ring">
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--jnpr-surface-3)" strokeWidth={5} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--jnpr-good)" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${cx} ${cx})`} />
      </svg>
      <span className="rv tnum">{score}</span>
    </div>
  );
}
