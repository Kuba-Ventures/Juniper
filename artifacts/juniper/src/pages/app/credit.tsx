import { PageHeader } from "@/components/juniper/app-frame";
import { credit, creditCards, money } from "@/lib/mock-data";
import { BrandTile, PlanSpark } from "@/components/juniper/primitives";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function CardsBreakdown() {
  const tb = creditCards.reduce((a, c) => a + c.bal, 0);
  const tl = creditCards.reduce((a, c) => a + c.limit, 0);
  const tu = Math.round((tb / tl) * 100);
  return (
    <>
      <div className="util-hero">
        <div>
          <div className="eyebrow">Overall utilization</div>
          <div className="big tnum">{tu}%</div>
          <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 2 }}>{money(tb)} of {money(tl)} across {creditCards.length} cards</div>
        </div>
        <div className="ub">
          <div className="bar" style={{ height: 10 }}><i style={{ width: `${tu}%`, background: tu > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} /></div>
          <div style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", marginTop: 7 }}>
            Under 30% is best for your score, you're {tu > 30 ? "a bit above" : "under"} the line, driven mostly by the Quicksilver card.
          </div>
        </div>
      </div>
      {creditCards.map((c, i) => {
        const u = Math.round((c.bal / c.limit) * 100);
        return (
          <div className="card-row" key={i}>
            <BrandTile name={c.n} letter={c.n[0]} k={c.k} />
            <div className="ci">
              <div className="cn">{c.n}</div>
              <div className="csub">{money(c.bal)} of {money(c.limit)} limit · <span className="apr-chip">{c.apr} APR</span></div>
            </div>
            <div className="util">
              <div className="ut"><span>Used</span><span className={u > 30 ? "hi" : undefined}>{u}%</span></div>
              <div className="bar"><i style={{ width: `${u}%`, background: u > 30 ? "var(--jnpr-warn)" : "var(--jnpr-accent)" }} /></div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function Credit() {
  const markerPct = ((credit.score - 300) / (850 - 300)) * 100;
  return (
    <div className="frame">
      <PageHeader
        title="Credit"
        sub="Your credit score, monitored monthly with a soft pull that never affects it, plus every card and how much of your limit you're using."
        actions={<span className="plaid-pill"><span className="dot" />Updated {credit.updated}</span>}
      />

      <div className="card pad-lg" style={{ marginBottom: 16 }}>
        <div className="credit-hero">
          <div>
            <div className="eyebrow">Your credit score</div>
            <div className="credit-num">
              <span className="big tnum">{credit.score}</span>
              <span className="delta up"><UpArrow />+{credit.delta} pts since June</span>
            </div>
            <div className="credit-band-lg">{credit.band}</div>
            <div className="credit-scale">
              <div className="scale-bar">
                <span style={{ background: "var(--jnpr-bad)" }} />
                <span style={{ background: "var(--jnpr-warn)" }} />
                <span style={{ background: "var(--jnpr-c6)" }} />
                <span style={{ background: "var(--jnpr-good)" }} />
                <span style={{ background: "var(--jnpr-accent-deep)" }} />
              </div>
              <div className="scale-marker"><i style={{ left: `${markerPct}%` }} /></div>
              <div className="scale-labels"><span>300 · Poor</span><span>Fair</span><span>Good</span><span>Very good</span><span>Excellent · 850</span></div>
            </div>
            <p className="disc" style={{ marginTop: 16 }}>VantageScore 3.0 · refreshed monthly through a credit-data provider · soft pull, no impact to your score.</p>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Score · last 8 months</div>
            <PlanSpark data={credit.trend} k="--jnpr-accent" />
          </div>
        </div>
      </div>

      <div className="card pad-lg" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Credit cards</h3><span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>{creditCards.length} cards</span></div>
        <CardsBreakdown />
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h3>Recent alerts</h3><button className="link">All alerts</button></div>
          <div>
            {credit.alerts.map((a, i) => (
              <div className="alert" key={i}>
                <span className={`adot ${a.dir}`} />
                <div><div className="at">{a.t}</div><div className="ad">{a.d}</div></div>
                <span className={`imp ${a.dir}`}>{a.imp}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>What affects your score</h3></div>
          <div>
            {credit.factors.map((f, i) => (
              <div className="cfactor" key={i}>
                <div><div className="cn">{f.n}</div><div className="cv">{f.v}</div></div>
                <span className={`cr ${f.cls}`}>{f.r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
