import { money } from "@/lib/mock-data";
import { SharedPage } from "@/components/juniper/shared-frame";
import { bills, you, partner as demoPartner, type Bill } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";

export function SharedBills() {
  const { partner } = useWorkspace();
  const name = partner.name || demoPartner.name;
  const payerLabel = (b: Bill) =>
    b.payer === "you" ? `${you.name} pays` : b.payer === "partner" ? `${name} pays` : "Shared · split 50/50";
  const monthly = bills.reduce((a, b) => a + b.amount, 0);

  return (
    <SharedPage title="Bills & reminders" sub="Shared bills, who pays, and a nudge before each one's due — so nothing slips.">
      <div className="sum-strip">
        <div className="sum-card"><div className="l">This month</div><div className="v tnum">{money(monthly)}</div><div className="s">{bills.length} tracked bills</div></div>
        <div className="sum-card"><div className="l">Split evenly</div><div className="v tnum">{money(Math.round(bills.filter((b) => b.split).reduce((a, b) => a + b.amount, 0)))}</div><div className="s">shared 50/50</div></div>
        <div className="sum-card"><div className="l">Due soon</div><div className="v tnum">{bills.filter((b) => b.soon).length}</div><div className="s">in the next few days</div></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Upcoming</h3><button className="link">Add bill</button></div>
        <div>
          {bills.map((b, i) => (
            <div className={`bill ${b.soon ? "soon" : ""}`} key={i}>
              <div className="due"><div className="d">{b.day}</div><div className="mo">{b.mo}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{b.name}</div><div className="mt">{payerLabel(b)}{b.soon ? " · due in 3 days" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div className="b-amt tnum">{money(b.amount)}</div>
                {b.soon && <button className="btn ghost sm" style={{ marginTop: 5 }}>Nudge {b.payer === "you" ? "" : name}</button>}
              </div>
            </div>
          ))}
        </div>
        <p className="disc">Both of you get a reminder before a shared bill is due. Nudge sends a friendly heads-up to whoever's paying.</p>
      </div>
    </SharedPage>
  );
}
