import { Link } from "wouter";
import { money, moneyK } from "@/lib/mock-data";
import { cssVar, planMark } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { combined, sharedAccounts, sharedGoals, you, partner as demoPartner, type SharedAccount } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import type { SeriesKey } from "@/lib/mock-data";

const GOAL_CYCLE: SeriesKey[] = ["--jnpr-c1", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6"];

const privacyChip = { shared: "Shared", balance: "Balance only", private: "Private" } as const;

function AccountRow({ a }: { a: SharedAccount }) {
  const priv = a.privacy === "private";
  return (
    <div className="row">
      <div className="tile sm" style={{ background: cssVar(a.k) }}>{a.n.charAt(0)}</div>
      <div><div className="nm">{a.n}</div><div className="mt">{a.inst}</div></div>
      <div className="amt">
        {priv ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
        <span className={`chip ${a.privacy}`}>{privacyChip[a.privacy]}</span>
      </div>
    </div>
  );
}

export function SharedOverview() {
  const { partner } = useWorkspace();
  const { data } = usePartner();
  const name = partner.name || demoPartner.name;
  // Live combined net worth + shared goals when a real partnership exists; else demo.
  const live = data?.connected ? data : null;
  const c = live?.combined ?? combined;
  const goals = live?.goals?.length
    ? live.goals.map((g, i) => ({ t: g.t, icon: g.icon, k: GOAL_CYCLE[i % GOAL_CYCLE.length], target: g.target, you: g.you, partner: g.partner }))
    : sharedGoals;
  const yShare = c.netWorth ? Math.round((c.youShare / c.netWorth) * 100) : 50;
  const pShare = 100 - yShare;
  const mine = sharedAccounts.filter((a) => a.owner === "you");
  const theirs = sharedAccounts.filter((a) => a.owner === "partner");
  const joint = sharedAccounts.filter((a) => a.owner === "shared");

  return (
    <SharedPage title={`Shared with ${name}`} sub="Both your finances, only what you each choose to share.">
      {/* combined net worth */}
      <div className="card pad-lg together" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Together</div>
        <div className="big-num tnum" style={{ margin: "6px 0 2px" }}>{money(c.netWorth)}</div>
        {!live && <div className="delta up" style={{ fontSize: 13 }}>▲ {money(combined.changeAbs)} this month</div>}
        <div className="split-bar"><i style={{ width: `${yShare}%`, background: cssVar(you.k) }} /><i style={{ width: `${pShare}%`, background: cssVar(demoPartner.k) }} /></div>
        <div className="split-legend">
          <span><span className="dot" style={{ background: cssVar(you.k) }} /> {you.name} · <b className="tnum">{money(c.youShare)}</b></span>
          <span><span className="dot" style={{ background: cssVar(demoPartner.k) }} /> {name} · <b className="tnum">{money(c.partnerShare)}</b></span>
        </div>
      </div>

      {/* shared accounts */}
      <div className="card shared-accts" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span className="dot" style={{ background: "var(--jnpr-good)" }} /> Shared accounts</h3><Link href="/app/shared/accounts" className="link">See all</Link></div>
        <div className="rows">{joint.map((a, i) => <AccountRow a={a} key={i} />)}</div>
      </div>

      {/* his & hers */}
      <div className="grid two" style={{ marginBottom: 16 }}>
        {[{ arr: mine, who: you.name, k: you.k, total: c.youShare }, { arr: theirs, who: name, k: demoPartner.k, total: c.partnerShare }].map((col, i) => (
          <div className="card owner-col" style={{ borderTopColor: cssVar(col.k) }} key={i}>
            <div className="oc-head">
              <span className="oc-ava" style={{ background: cssVar(col.k) }}>{col.who.charAt(0).toUpperCase()}</span>
              <b>{col.who}</b><span className="oc-tot tnum">{money(col.total)}</span>
            </div>
            <div className="rows">{col.arr.map((a, j) => <AccountRow a={a} key={j} />)}</div>
          </div>
        ))}
      </div>

      {/* shared goals */}
      <div className="card">
        <div className="card-head"><h3>Shared goals</h3><Link href="/app/shared/goals" className="link">+ New shared goal</Link></div>
        {goals.map((g, i) => {
          const funded = g.you + g.partner;
          const pct = Math.round((funded / g.target) * 100);
          return (
            <div className="goal" key={i}>
              <div className="g-top">
                <div className="g-ic" style={{ background: cssVar(g.k) }}>{planMark({ icon: g.icon, ab: g.t[0] })}</div>
                <b style={{ flex: 1 }}>{g.t}</b>
                <span className="tnum" style={{ fontWeight: 700 }}>{moneyK(funded)} <small style={{ color: "var(--jnpr-ink-3)" }}>/ {moneyK(g.target)}</small></span>
              </div>
              <div className="bar"><i style={{ width: `${(g.you / g.target) * 100}%`, background: cssVar(you.k) }} /><i style={{ width: `${(g.partner / g.target) * 100}%`, background: cssVar(demoPartner.k) }} /></div>
              <div className="contrib"><span><b style={{ color: cssVar(you.k) }}>{you.name}</b> {moneyK(g.you)} · <b style={{ color: cssVar(demoPartner.k) }}>{name}</b> {moneyK(g.partner)}</span><span>{pct}% funded</span></div>
            </div>
          );
        })}
      </div>
    </SharedPage>
  );
}
