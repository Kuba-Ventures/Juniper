import { Link } from "wouter";
import { plans, money, moneyK, money2, type Budget, type Account } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import {
  BrandTile, planMark, cssVar, NetWorthChart, SpendingDonut, MiniRing,
} from "@/components/juniper/primitives";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Budgets({ items }: { items: Budget[] }) {
  return (
    <div>
      {items.map((b, i) => {
        const pct = Math.min(100, Math.round((b.s / b.l) * 100));
        const over = b.s > b.l;
        return (
          <div className={`bud ${over ? "over" : "ok"}`} key={i}>
            <div className="t">
              <span>{b.c}</span>
              <span className="r"><b className="tnum">{money(b.s)}</b> of {money(b.l)}{over && <> · <span className="flag">{money(b.s - b.l)} over</span></>}</span>
            </div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function AccountGroup({ title, arr }: { title: string; arr: Account[] }) {
  return (
    <>
      <div className="subhead">{title}</div>
      {arr.map((a, i) => (
        <div className="row" key={i}>
          <BrandTile name={a.n} letter={a.n[0]} k={a.k} />
          <div><div className="nm">{a.n}</div><div className="mt">{a.i}</div></div>
          <div className="amt">{money(a.v)} {a.apr && <span className="apr-chip">{a.apr}</span>}</div>
        </div>
      ))}
    </>
  );
}

export default function Home({ name }: { name: string }) {
  const { data } = useFinances();
  const { netWorth, cashflow, spending, budgets, transactions, accounts, score } = data;
  const first = (name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="frame">
      <div className="greet">
        <h1>Good morning, {first}</h1>
        <div className="meta"><span>{today}</span><span>·</span><span className="up">Net worth up {money(netWorth.changeAbs)} this month</span></div>
      </div>

      <div className="score-strip" style={{ marginBottom: 16 }}>
        <MiniRing score={score.value} />
        <div>
          <div className="st-t">Juniper Score <span className="band">{score.value} · {score.band}</span></div>
          <div className="st-s"><b>{score.delta >= 0 ? "+" : ""}{score.delta} pts</b> this month · biggest lever: {score.lever}</div>
        </div>
        <Link href="/app/score" className="link" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>See breakdown →</Link>
      </div>

      <div className="grid hero" style={{ marginBottom: 16 }}>
        <div className="card pad-lg">
          <div className="card-head">
            <div>
              <div className="eyebrow">Net worth</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 6 }}>
                <span className="big-num tnum">{money(netWorth.value)}</span>
                <span className="delta up" style={{ marginBottom: 5 }}><UpArrow />{netWorth.changePct}%</span>
              </div>
            </div>
            <div className="pills" role="group" aria-label="Range">
              <button>1M</button><button>3M</button><button>6M</button><button className="on">1Y</button><button>All</button>
            </div>
          </div>
          <NetWorthChart series={netWorth.series} labels={netWorth.labels} />
          <div className="cf-foot">
            <div><div className="l">Income · {cashflow.month}</div><div className="v pos tnum">+{money(cashflow.income)}</div></div>
            <div><div className="l">Spent</div><div className="v tnum">{money(cashflow.spent)}</div></div>
            <div><div className="l">Saved</div><div className="v acc tnum">{money(cashflow.saved)}</div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Your plans</h3><Link href="/app/plans" className="link">+ New</Link></div>
          <div className="plans-col">
            {plans.filter((p) => !p.done).map((p, i) => {
              const prog = p.target ? Math.round((p.saved / p.target) * 100) : p.pct;
              return (
                <Link href="/app/plans" className="plan-row" key={i}>
                  <div className="track" style={{ background: cssVar(p.k) }}>{planMark(p)}</div>
                  <div className="pr-body">
                    <div className="pr-top">
                      <span className="pt">{p.t}</span>
                      {p.target ? <span className="amt tnum">{moneyK(p.saved)} <small>/ {moneyK(p.target)}</small></span> : null}
                    </div>
                    <div className="bar"><i style={{ width: `${prog}%`, background: cssVar(p.k) }} /></div>
                    <div className="pr-bot"><span>{p.note}</span><span className={`status ${p.st}`}>{p.stl}</span></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><h3>Spending by category</h3><Link href="/app/spending" className="link">July ▾</Link></div>
          <SpendingDonut data={spending} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Budgets</h3><Link href="/app/spending" className="link">Edit</Link></div>
          <Budgets items={budgets} />
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h3>Recent transactions</h3><Link href="/app/spending" className="link">See all</Link></div>
          <div className="rows">
            {transactions.slice(0, 6).map((t, i) => (
              <div className="row" key={i}>
                <BrandTile name={t.m} letter={t.m[0]} k={t.k} />
                <div><div className="nm">{t.m}</div><div className="mt">{t.c} · {t.d}</div></div>
                <div className={`amt ${t.inc ? "inc" : ""}`}>{money2(t.v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Accounts</h3><span className="link">Manage</span></div>
          <div className="rows">
            <AccountGroup title="Cash" arr={accounts.cash} />
            <AccountGroup title="Investments" arr={accounts.invest} />
            <AccountGroup title="Debts" arr={accounts.debt} />
          </div>
        </div>
      </div>
    </div>
  );
}
