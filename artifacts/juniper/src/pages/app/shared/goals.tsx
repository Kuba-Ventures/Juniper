import { money, moneyK } from "@/lib/mock-data";
import { cssVar, planMark } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { sharedGoals, you, partner as demoPartner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";

export function SharedGoals() {
  const { partner } = useWorkspace();
  const name = partner.name || demoPartner.name;
  return (
    <SharedPage title="Shared goals" sub="Goals you're funding together — with each person's contribution.">
      <div className="grid two">
        {sharedGoals.map((g, i) => {
          const funded = g.you + g.partner;
          const pct = Math.round((funded / g.target) * 100);
          return (
            <div className="card plan-lg" key={i}>
              <div className="ph">
                <div className="track" style={{ background: cssVar(g.k) }}>{planMark({ icon: g.icon, ab: g.t[0] })}</div>
                <div style={{ flex: 1 }}><div className="pt">{g.t}</div><div className="pn">{pct}% funded · {money(g.target - funded)} to go</div></div>
              </div>
              <div className="body">
                <div className="nums"><div className="big tnum">{money(funded)} <small>/ {money(g.target)}</small></div></div>
                <div className="bar"><i style={{ width: `${(g.you / g.target) * 100}%`, background: cssVar(you.k) }} /><i style={{ width: `${(g.partner / g.target) * 100}%`, background: cssVar(demoPartner.k) }} /></div>
                <div className="contrib" style={{ marginTop: 9 }}>
                  <span><span className="dot" style={{ background: cssVar(you.k) }} /> {you.name} <b className="tnum">{moneyK(g.you)}</b></span>
                  <span><span className="dot" style={{ background: cssVar(demoPartner.k) }} /> {name} <b className="tnum">{moneyK(g.partner)}</b></span>
                </div>
                <div className="plan-meta" style={{ marginTop: 12 }}>
                  <button className="btn sm">Add contribution</button>
                  <span className="pm-date">Auto-split 50/50</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="disc">Shared goals are always visible to both of you — that's the point. Individual goals stay on your private Plans page.</p>
    </SharedPage>
  );
}
