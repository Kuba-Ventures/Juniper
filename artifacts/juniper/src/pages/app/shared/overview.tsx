// The shared overview: what the two of you are worth together, which accounts
// each of you has chosen to share, and how the shared goals are funded.
//
// Live data only, as of Stage 4d. Every figure here comes from /api/partner,
// which rolls up both members' accounts while honouring each side's sharing
// settings, so an account somebody kept private is not counted into a total the
// other person can see. A partnership with nothing shared yet says so.
import { Link } from "wouter";
import { money, moneyK } from "@/lib/mock-data";
import { cssVar, planMark } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { usePartner, type PartnerAccount } from "@/lib/partner";

const GOAL_CYCLE = ["--jnpr-c1", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6"];
const YOU_COLOR = "--jnpr-c3";
const THEM_COLOR = "--jnpr-c5";

const scopeChip = { shared: "Shared", balance: "Balance only", private: "Private" } as const;

function AccountRow({ a }: { a: PartnerAccount }) {
  // "Private" here means the other member chose not to share the balance, so
  // there is no number to show rather than a number being withheld from the
  // person looking: /api/partner never sends it.
  const hidden = a.scope === "private";
  return (
    <div className="row">
      <div className="tile sm" style={{ background: cssVar(a.mine ? YOU_COLOR : THEM_COLOR) }}>{a.n.charAt(0)}</div>
      <div><div className="nm">{a.n}</div><div className="mt">{a.inst}</div></div>
      <div className="amt">
        {hidden ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
        <span className={`chip ${a.scope}`}>{scopeChip[a.scope]}</span>
      </div>
    </div>
  );
}

export function SharedOverview() {
  const { partner } = useWorkspace();
  const { data, loading } = usePartner();
  const name = partner.name || data?.partner?.name || "your partner";

  const combined = data?.combined;
  const accounts = data?.accounts ?? [];
  const goals = data?.goals ?? [];
  const mine = accounts.filter((a) => a.owner === "you");
  const theirs = accounts.filter((a) => a.owner === "partner");
  const joint = accounts.filter((a) => a.owner === "shared");

  const total = combined?.netWorth ?? 0;
  // A zero total would make both shares 0% and draw an empty bar, so the split
  // is only drawn once there is something to split.
  const yShare = total ? Math.round((combined!.youShare / total) * 100) : 0;
  const pShare = total ? 100 - yShare : 0;

  return (
    <SharedPage title={`Shared with ${name}`} sub="Both your finances, only what you each choose to share.">
      <div className="card pad-lg together" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Together</div>
        <div className="big-num tnum" style={{ margin: "6px 0 2px" }}>{money(total)}</div>
        {total > 0 ? (
          <>
            <div className="split-bar">
              <i style={{ width: `${yShare}%`, background: cssVar(YOU_COLOR) }} />
              <i style={{ width: `${pShare}%`, background: cssVar(THEM_COLOR) }} />
            </div>
            <div className="split-legend">
              <span><span className="dot" style={{ background: cssVar(YOU_COLOR) }} /> You · <b className="tnum">{money(combined!.youShare)}</b></span>
              <span><span className="dot" style={{ background: cssVar(THEM_COLOR) }} /> {name} · <b className="tnum">{money(combined!.partnerShare)}</b></span>
            </div>
          </>
        ) : (
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {loading ? "Reading your shared accounts…" : `Neither of you is sharing a balance yet. Whatever you share appears here, and only what you share.`}
          </p>
        )}
      </div>

      {joint.length > 0 && (
        <div className="card shared-accts" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3><span className="dot" style={{ background: "var(--jnpr-good)" }} /> Shared accounts</h3></div>
          <div className="rows">{joint.map((a) => <AccountRow a={a} key={a.account_id} />)}</div>
        </div>
      )}

      {(mine.length > 0 || theirs.length > 0) && (
        <div className="grid two" style={{ marginBottom: 16 }}>
          {[
            { arr: mine, who: "You", k: YOU_COLOR, total: combined?.youShare ?? 0 },
            { arr: theirs, who: name, k: THEM_COLOR, total: combined?.partnerShare ?? 0 },
          ].map((col, i) => (
            <div className="card owner-col" style={{ borderTopColor: cssVar(col.k) }} key={i}>
              <div className="oc-head">
                <span className="oc-ava" style={{ background: cssVar(col.k) }}>{col.who.charAt(0).toUpperCase()}</span>
                <b>{col.who}</b><span className="oc-tot tnum">{money(col.total)}</span>
              </div>
              <div className="rows">
                {col.arr.length > 0
                  ? col.arr.map((a) => <AccountRow a={a} key={a.account_id} />)
                  : <p className="sub" style={{ padding: "10px 0 2px" }}>Nothing shared from this side yet.</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Shared goals</h3>
          <Link href="/app/shared/goals" className="link">{goals.length > 0 ? "See all" : "+ New shared goal"}</Link>
        </div>
        {goals.length === 0 ? (
          <p className="sub" style={{ margin: "4px 0 2px" }}>
            Nothing yet. A shared goal records who contributed what, so the split is never a memory test.
          </p>
        ) : (
          goals.map((g, i) => {
            const funded = g.you + g.partner;
            const pct = g.target > 0 ? Math.round((funded / g.target) * 100) : 0;
            const width = (v: number) => (g.target > 0 ? `${Math.min(100, (v / g.target) * 100)}%` : "0%");
            return (
              <div className="goal" key={g.id}>
                <div className="g-top">
                  <div className="g-ic" style={{ background: cssVar(GOAL_CYCLE[i % GOAL_CYCLE.length]) }}>{planMark({ icon: g.icon, ab: g.t[0] })}</div>
                  <b style={{ flex: 1 }}>{g.t}</b>
                  <span className="tnum" style={{ fontWeight: 700 }}>
                    {moneyK(funded)} {g.target > 0 && <small style={{ color: "var(--jnpr-ink-3)" }}>/ {moneyK(g.target)}</small>}
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: width(g.you), background: cssVar(YOU_COLOR) }} />
                  <i style={{ width: width(g.partner), background: cssVar(THEM_COLOR) }} />
                </div>
                <div className="contrib">
                  <span><b style={{ color: cssVar(YOU_COLOR) }}>You</b> {moneyK(g.you)} · <b style={{ color: cssVar(THEM_COLOR) }}>{name}</b> {moneyK(g.partner)}</span>
                  <span>{g.target > 0 ? `${pct}% funded` : "No target yet"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SharedPage>
  );
}
