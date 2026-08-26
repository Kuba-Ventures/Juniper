import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  subscriptions as seedSubs,
  money, moneyK, money2,
  type Budget, type Account, type Subscription, type Txn,
} from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import {
  useMemberPlans, planTitle, planColor, planShape, planNumbers, SHAPE_ICON,
} from "@/lib/plans";
import {
  BrandTile, PlanIcon, cssVar, NetWorthChart, SpendingDonut, MiniRing,
} from "@/components/juniper/primitives";

const UpArrow = () => (
  <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11 5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07L13 19" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
);

// Shown in place of the spending/budgets/subscriptions cards when there's no
// transaction feed yet (manual or demo data). Nothing fake is presented as the
// member's, just an honest path to unlock the real thing.
function ConnectNudge() {
  return (
    <div className="card nudge-card">
      <div className="nc-mark"><LinkIcon /></div>
      <h3>Unlock spending, budgets & subscriptions</h3>
      <p>Connect an account and Juniper categorizes your transactions automatically: spending breakdowns, budgets, and subscription tracking appear here.</p>
      <Link href="/app/connections" className="btn" style={{ marginTop: 4 }}>Connect an account</Link>
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

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
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
      <p className="disc">Juniper submits cancellations on your behalf and confirms once done, often via an assisted or partner flow, not a universal one-click API. Nothing is canceled without your approval.</p>

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

// The member's real plans, read through the same `useMemberPlans` hook the Plans
// page uses so the two surfaces cannot disagree about what exists. Example plans
// live only on the Plans page: they are illustration, so they must never appear
// here, where everything on the screen is the member's own money.
function YourPlansCard() {
  const { plans, loading } = useMemberPlans();
  const active = plans.filter((p) => p.status !== "completed");
  return (
    <div className="card">
      <div className="card-head"><h3>Your plans</h3><Link href="/app/plans" className="link">+ New</Link></div>
      {loading ? (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>Loading your plans…</div>
      ) : active.length ? (
        <div className="plans-col">
          {active.map((p) => {
            const shape = planShape(p);
            const color = planColor(p);
            const { current, target } = planNumbers(p);
            const prog = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
            return (
              <Link href="/app/plans" className="plan-row" key={p.domain}>
                <div className="track" style={{ background: cssVar(color) }}><PlanIcon name={SHAPE_ICON[shape]} /></div>
                <div className="pr-body">
                  <div className="pr-top">
                    <span className="pt">{planTitle(p)}</span>
                    {target > 0 ? <span className="amt tnum">{moneyK(current)} <small>/ {moneyK(target)}</small></span> : null}
                  </div>
                  <div className="bar"><i style={{ width: `${prog}%`, background: cssVar(color) }} /></div>
                  <div className="pr-bot">
                    <span>{target > 0 ? `${prog}% funded` : "No target set yet"}</span>
                    <span className={`status ${target > 0 ? "ok" : "setup"}`}>{target > 0 ? "On track" : "Setup"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, lineHeight: 1.6 }}>
          No plans yet. Turn a goal into a plan (save for a home, pay off debt, build an emergency fund) and track it here.
          <div style={{ marginTop: 12 }}><Link href="/app/plans" className="btn sm">Start a plan</Link></div>
        </div>
      )}
    </div>
  );
}

export default function Overview({
  name,
  showWelcome,
  onDismissWelcome,
}: {
  name: string;
  showWelcome?: boolean;
  onDismissWelcome?: () => void;
}) {
  const { data, hasTransactions } = useFinances();
  const { netWorth, cashflow, spending, budgets, transactions, accounts, score } = data;
  const first = (name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const totalSpent = spending.reduce((a, s) => a + s.v, 0);
  // With no transaction feed (manual entry, demo, or a fresh link whose
  // transactions haven't landed), spending/budgets/subs have nothing real to
  // show, so swap them for an honest connect nudge.
  //
  // Gated on the server's `hasTransactions`, not on source === "live", which is
  // now true for a member who only has balances (api/finances.ts gates per
  // section). One panel below this flag, Subscriptions, still renders seeded
  // demo rows, so widening the flag would show demo data to more people. A later
  // stage deletes those seeds; until then this stays pinned to the one signal
  // that means a real feed exists. The "Your plans" card no longer sits behind
  // it: real plans exist whether or not a transaction feed does, so it reads
  // them directly and shows its own empty state.
  const hasTxns = hasTransactions && (transactions.length > 0 || spending.length > 0);
  return (
    <div className="frame">
      <div className="greet">
        <h1>Good morning, {first}</h1>
        <div className="meta">
          <span>{today}</span>
          <span>·</span>
          {netWorth.changeAbs > 0
            ? <span className="up">Net worth up {money(netWorth.changeAbs)} this month</span>
            : <span>Here's your financial picture</span>}
        </div>
      </div>

      {showWelcome && (
        <div className="welcome-tip">
          <div className="wt-body">
            <b>Welcome to Juniper, {first} 🌿</b>
            <p>This is your dashboard. Your net worth, accounts, and Juniper Score are built from what you shared. Connect an account anytime to unlock live spending, budgets, and subscriptions.</p>
          </div>
          <button className="wt-x" onClick={onDismissWelcome} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="score-strip" style={{ marginBottom: 16 }}>
        <MiniRing score={score.value} />
        <div>
          <div className="st-t">Juniper Score <span className="band">{score.value} · {score.band}</span></div>
          <div className="st-s">
            {score.delta !== 0
              ? <><b>{score.delta >= 0 ? "+" : ""}{score.delta} pts</b> this month · biggest lever: {score.lever}</>
              : <>Your starting score · biggest lever: {score.lever}</>}
          </div>
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

        <YourPlansCard />
      </div>

      {hasTxns && (
        <div className="grid two" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head"><h3>Where it went: {money(totalSpent)}</h3><span className="pills"><button>June</button><button className="on">July</button><button>Aug</button></span></div>
            <SpendingDonut data={spending} />
          </div>
          <div className="card">
            <div className="card-head"><h3>Budgets</h3><button className="link">Edit</button></div>
            <Budgets items={budgets} />
          </div>
        </div>
      )}

      <div className="grid two" style={{ marginBottom: 16 }}>
        {hasTxns ? <TransactionsPanel items={transactions} /> : <ConnectNudge />}
        <div className="card">
          <div className="card-head"><h3>Accounts</h3><Link href="/app/connections" className="link">Manage</Link></div>
          {accounts.cash.length + accounts.invest.length + accounts.debt.length === 0 ? (
            <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>
              No accounts yet. <Link href="/app/connections" className="link">Connect one</Link> to see balances here.
            </div>
          ) : (
            <div className="rows">
              {accounts.cash.length > 0 && <AccountGroup title="Cash" arr={accounts.cash} />}
              {accounts.invest.length > 0 && <AccountGroup title="Investments" arr={accounts.invest} />}
              {accounts.debt.length > 0 && <AccountGroup title="Debts" arr={accounts.debt} />}
            </div>
          )}
        </div>
      </div>

      {hasTxns && <SubscriptionsPanel />}
    </div>
  );
}
