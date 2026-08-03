import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import {
  subscriptions as seedSubs,
  money, money2, type Subscription, type Budget, type Txn, type SpendCat,
} from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { BrandTile, SpendingDonut } from "@/components/juniper/primitives";

type Tab = "overview" | "transactions" | "budgets" | "subs";
const TABS: [Tab, string][] = [["overview", "Overview"], ["transactions", "Transactions"], ["budgets", "Budgets"], ["subs", "Subscriptions"]];

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

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

function TransactionsPanel({ items }: { items: Txn[] }) {
  const [q, setQ] = useState("");
  const rows = items.filter((t) => (t.m + " " + t.c).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div className="card-head">
        <h3>Transactions</h3>
        <span className="search" style={{ maxWidth: 220 }}>
          <SearchIcon />
          <input placeholder="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
      </div>
      <div className="rows">
        {rows.map((t, i) => (
          <div className="row" key={i}>
            <BrandTile name={t.m} letter={t.m[0]} k={t.k} />
            <div><div className="nm">{t.m}</div><div className="mt">{t.c} · {t.d}</div></div>
            <div className={`amt ${t.inc ? "inc" : ""}`}>{money2(t.v)}</div>
          </div>
        ))}
        {!rows.length && <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>No matching transactions.</div>}
      </div>
    </div>
  );
}

function SubscriptionsPanel() {
  const [subs, setSubs] = useState<Subscription[]>(() => seedSubs.map((s) => ({ ...s })));
  const [target, setTarget] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const active = subs.filter((s) => !s.canceled);
  const monthly = active.reduce((a, s) => a + s.amt, 0);
  const flagged = active.filter((s) => s.flag).length;
  const savings = active.filter((s) => s.flag?.includes("Not used")).reduce((a, s) => a + s.amt, 0);

  const openCancel = (i: number) => { setTarget(i); setConfirmed(false); };
  const close = () => setTarget(null);
  const sub = target != null ? subs[target] : null;

  return (
    <>
      <div className="sum-strip">
        <div className="sum-card"><div className="l">Monthly total</div><div className="v tnum">{money(monthly)}</div><div className="s">{active.length} subscriptions · {money(Math.round(monthly * 12))}/yr</div></div>
        <div className="sum-card"><div className="l">Flagged to review</div><div className="v tnum">{flagged}</div><div className="s">price hikes + unused</div></div>
        <div className="sum-card"><div className="l">You could save</div><div className="v acc tnum">{money(Math.round(savings))}/mo</div><div className="s">~{money(Math.round(savings * 12))}/yr on unused</div></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Subscriptions</h3><span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>Sorted by next charge</span></div>
        <div className="rows">
          {subs.map((s, i) => (
            <div className={`sub-row ${s.canceled ? "canceled" : ""}`} key={i}>
              <BrandTile name={s.n} letter={s.n[0]} k={s.k} />
              <div style={{ minWidth: 0 }}>
                <div className="nm">{s.n}</div>
                <div className="mt">{s.cat} · next {s.next}{s.flag && <span className="sub-flag">{s.flag}</span>}</div>
              </div>
              <div className="sub-amt"><div className="a tnum">${s.amt.toFixed(2)}</div><div className="c">/mo</div></div>
              {s.canceled
                ? <button className="btn ghost sm" disabled>Cancellation requested</button>
                : <button className="btn ghost sm" onClick={() => openCancel(i)}>Cancel</button>}
            </div>
          ))}
        </div>
      </div>
      <p className="disc">Juniper submits cancellations on your behalf and confirms once done — often via an assisted or partner flow, not a universal one-click API. Nothing is canceled without your approval.</p>

      {sub && !confirmed && (
        <Backdrop onClose={close}>
          <h3>Cancel {sub.n}?</h3>
          <p>Juniper will submit the cancellation on your behalf and confirm within 2 business days. Nothing is canceled until you approve here.</p>
          <div className="facts">
            <div className="fr"><span className="k">Plan</span><span className="v">{sub.cat}</span></div>
            <div className="fr"><span className="k">Cost</span><span className="v tnum">${sub.amt.toFixed(2)}/mo</span></div>
            <div className="fr"><span className="k">Next charge</span><span className="v">{sub.next}</span></div>
            <div className="fr"><span className="k">You'll save</span><span className="v save-hl tnum">~{money(Math.round(sub.amt * 12))}/yr</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => { setSubs((cur) => cur.map((x, idx) => (idx === target ? { ...x, canceled: true } : x))); setConfirmed(true); }}>Request cancellation</button>
            <button className="btn ghost" onClick={close}>Keep it</button>
          </div>
          <div className="fine">We'll email you when it's confirmed. You can undo within 24 hours.</div>
        </Backdrop>
      )}
      {sub && confirmed && (
        <Backdrop onClose={close}>
          <h3>Cancellation requested</h3>
          <p><b>{sub.n}</b> is being canceled. We'll confirm by {sub.next} and you won't be charged after this cycle. Estimated savings: <span className="save-hl">{money(Math.round(sub.amt * 12))}/yr</span>.</p>
          <div className="modal-actions"><button className="btn" onClick={close}>Done</button></div>
        </Backdrop>
      )}
    </>
  );
}

export function Spending() {
  const [tab, setTab] = useState<Tab>("overview");
  const { data } = useFinances();
  const spending: SpendCat[] = data.spending;
  const budgets: Budget[] = data.budgets;
  const transactions: Txn[] = data.transactions;
  const totalSpent = spending.reduce((a, s) => a + s.v, 0);
  return (
    <div className="frame">
      <PageHeader
        title="Spending"
        sub="Every transaction, categorized — budgets, and the subscriptions hiding in your recurring charges."
        actions={
          <>
            <div className="pills"><button>June</button><button className="on">July</button><button>Aug</button></div>
            <button className="btn ghost sm">Export</button>
          </>
        }
      />

      <div className="pills" style={{ margin: "0 2px 16px" }} role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? "on" : undefined} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid two">
          <div className="card"><div className="card-head"><h3>Where it went — {money(totalSpent)}</h3></div><SpendingDonut data={spending} /></div>
          <div className="card"><div className="card-head"><h3>Budgets</h3><button className="link">Edit</button></div><Budgets items={budgets} /></div>
        </div>
      )}
      {tab === "transactions" && <TransactionsPanel items={transactions} />}
      {tab === "budgets" && <div className="card"><div className="card-head"><h3>Budgets</h3><button className="link">Edit budgets</button></div><Budgets items={budgets} /></div>}
      {tab === "subs" && <SubscriptionsPanel />}
    </div>
  );
}
