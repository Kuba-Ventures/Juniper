import { useState } from "react";
import { money } from "@/lib/mock-data";
import { SharedPage } from "@/components/juniper/shared-frame";
import { bills as mockBills, you, partner as demoPartner } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";
import { useBills, addBill, deleteBill } from "@/lib/partner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Row { id?: string; name: string; day: number; mo: string; payer: "you" | "partner" | "shared"; amount: number; soon: boolean; split: boolean }

export function SharedBills() {
  const { partner } = useWorkspace();
  const { bills: liveBills, refresh } = useBills();
  const name = partner.name || demoPartner.name;
  const live = liveBills != null;

  const today = new Date().getUTCDate();
  const rows: Row[] = live
    ? liveBills.map((b) => ({ id: b.id, name: b.name, day: b.dueDay ?? 1, mo: MONTHS[new Date().getUTCMonth()], payer: b.payer, amount: b.amount, split: b.split, soon: b.dueDay != null && b.dueDay - today >= 0 && b.dueDay - today <= 5 }))
    : mockBills.map((b) => ({ name: b.name, day: b.day, mo: b.mo, payer: b.payer, amount: b.amount, split: !!b.split, soon: !!b.soon }));

  const payerLabel = (r: Row) => (r.payer === "you" ? `${you.name} pays` : r.payer === "partner" ? `${name} pays` : "Shared · split 50/50");
  const monthly = rows.reduce((a, b) => a + b.amount, 0);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", day: "", payer: "shared" as Row["payer"] });
  const submit = async () => {
    const amount = Number(form.amount.replace(/[^0-9.]/g, ""));
    if (!form.name.trim() || !amount) return;
    await addBill({ name: form.name.trim(), amount, dueDay: Number(form.day) || undefined, payer: form.payer, split: form.payer === "shared" });
    setForm({ name: "", amount: "", day: "", payer: "shared" });
    setAdding(false);
    refresh();
  };
  const remove = async (id?: string) => { if (id) { await deleteBill(id); refresh(); } };

  return (
    <SharedPage title="Bills & reminders" sub="Shared bills, who pays, and a nudge before each one's due — so nothing slips.">
      <div className="sum-strip">
        <div className="sum-card"><div className="l">This month</div><div className="v tnum">{money(monthly)}</div><div className="s">{rows.length} tracked bills</div></div>
        <div className="sum-card"><div className="l">Split evenly</div><div className="v tnum">{money(Math.round(rows.filter((b) => b.split).reduce((a, b) => a + b.amount, 0)))}</div><div className="s">shared 50/50</div></div>
        <div className="sum-card"><div className="l">Due soon</div><div className="v tnum">{rows.filter((b) => b.soon).length}</div><div className="s">in the next few days</div></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Upcoming</h3>{live && <button className="link" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add bill"}</button>}</div>

        {adding && (
          <div className="form-col" style={{ marginBottom: 6 }}>
            <div className="field2">
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rent" /></label>
              <label>Amount<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" placeholder="$1,200" /></label>
            </div>
            <div className="field2">
              <label>Due day<input value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} inputMode="numeric" placeholder="1–31" /></label>
              <label>Who pays
                <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value as Row["payer"] })}>
                  <option value="shared">Shared · split</option><option value="you">{you.name}</option><option value="partner">{name}</option>
                </select>
              </label>
            </div>
            <button className="btn" onClick={submit}>Add bill</button>
          </div>
        )}

        <div>
          {rows.map((b, i) => (
            <div className={`bill ${b.soon ? "soon" : ""}`} key={b.id ?? i}>
              <div className="due"><div className="d">{b.day}</div><div className="mo">{b.mo}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{b.name}</div><div className="mt">{payerLabel(b)}{b.soon ? " · due soon" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div className="b-amt tnum">{money(b.amount)}</div>
                {b.id ? <button className="link" style={{ marginTop: 4, color: "var(--jnpr-ink-3)" }} onClick={() => remove(b.id)}>Remove</button>
                  : b.soon && <button className="btn ghost sm" style={{ marginTop: 5 }}>Nudge</button>}
              </div>
            </div>
          ))}
          {!rows.length && <div style={{ padding: "18px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>No bills yet — add your first shared bill.</div>}
        </div>
        <p className="disc">Both of you get a reminder before a shared bill is due.</p>
      </div>
    </SharedPage>
  );
}
