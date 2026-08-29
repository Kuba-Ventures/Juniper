// Shared bills: what the two of you owe each month, who pays, and what is due
// soon.
//
// Live data only, as of Stage 4f. This used to fall back to lib/shared-data's
// seeded household whenever /api/partner/bills had nothing, so a couple with no
// bills yet were shown somebody else's rent, and the "Add bill" control was
// hidden on exactly the screen where they needed it. An empty partnership now
// says it is empty.
//
// Both names come from the session and the partnership, never from a constant.
import { useState } from "react";
import { money } from "@/lib/mock-data";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { useSession } from "@/lib/use-session";
import { useBills, addBill, deleteBill } from "@/lib/partner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Days out that counts as "due soon". Six days rather than seven so a monthly
// bill is never flagged for two weeks running.
const SOON_DAYS = 5;

interface Row { id: string; name: string; day: number; mo: string; payer: "you" | "partner" | "shared"; amount: number; soon: boolean; split: boolean }

export function SharedBills() {
  const { partner, refresh: refreshWorkspace } = useWorkspace();
  const { bills, loading, refresh } = useBills();
  const session = useSession();
  const name = partner.name || "your partner";
  const myName =
    (session?.user.user_metadata as { name?: string } | undefined)?.name?.trim().split(/\s+/)[0] || "You";

  const today = new Date().getUTCDate();
  const rows: Row[] = (bills ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    day: b.dueDay ?? 1,
    mo: MONTHS[new Date().getUTCMonth()],
    payer: b.payer,
    amount: b.amount,
    split: b.split,
    soon: b.dueDay != null && b.dueDay - today >= 0 && b.dueDay - today <= SOON_DAYS,
  }));

  const payerLabel = (r: Row) =>
    r.payer === "you" ? `${myName} pays` : r.payer === "partner" ? `${name} pays` : "Shared · split 50/50";
  const monthly = rows.reduce((a, b) => a + b.amount, 0);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", day: "", payer: "shared" as Row["payer"] });

  // The workspace refresh matters as much as the local one: the app bar grows
  // its Bills tab off the same server answer, and the first bill is exactly the
  // moment that tab should appear.
  const reload = () => { refresh(); refreshWorkspace(); };

  const submit = async () => {
    const amount = Number(form.amount.replace(/[^0-9.]/g, ""));
    if (!form.name.trim() || !amount) return;
    await addBill({ name: form.name.trim(), amount, dueDay: Number(form.day) || undefined, payer: form.payer, split: form.payer === "shared" });
    setForm({ name: "", amount: "", day: "", payer: "shared" });
    setAdding(false);
    reload();
  };
  const remove = async (id: string) => { await deleteBill(id); reload(); };

  return (
    <SharedPage title="Bills & reminders" sub="Shared bills, who pays, and a nudge before each one's due, so nothing slips.">
      {/* The summary strip is only true once there is something to summarise.
          Three zeroes above an empty list says less than the list already does. */}
      {rows.length > 0 && (
        <div className="sum-strip">
          <div className="sum-card"><div className="l">This month</div><div className="v tnum">{money(monthly)}</div><div className="s">{rows.length} tracked bills</div></div>
          <div className="sum-card"><div className="l">Split evenly</div><div className="v tnum">{money(Math.round(rows.filter((b) => b.split).reduce((a, b) => a + b.amount, 0)))}</div><div className="s">shared 50/50</div></div>
          <div className="sum-card"><div className="l">Due soon</div><div className="v tnum">{rows.filter((b) => b.soon).length}</div><div className="s">in the next few days</div></div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h3>Upcoming</h3>
          <button className="link" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add bill"}</button>
        </div>

        {adding && (
          <div className="form-col" style={{ marginBottom: 6 }}>
            <div className="field2">
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rent" /></label>
              <label>Amount<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" placeholder="$1,200" /></label>
            </div>
            <div className="field2">
              <label>Due day<input value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} inputMode="numeric" placeholder="1-31" /></label>
              <label>Who pays
                <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value as Row["payer"] })}>
                  <option value="shared">Shared · split</option><option value="you">{myName}</option><option value="partner">{name}</option>
                </select>
              </label>
            </div>
            <button className="btn" onClick={submit}>Add bill</button>
          </div>
        )}

        <div>
          {rows.map((b) => (
            <div className={`bill ${b.soon ? "soon" : ""}`} key={b.id}>
              <div className="due"><div className="d">{b.day}</div><div className="mo">{b.mo}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{b.name}</div><div className="mt">{payerLabel(b)}{b.soon ? " · due soon" : ""}</div></div>
              <div style={{ textAlign: "right" }}>
                <div className="b-amt tnum">{money(b.amount)}</div>
                <button className="link" style={{ marginTop: 4, color: "var(--jnpr-ink-3)" }} onClick={() => remove(b.id)}>Remove</button>
              </div>
            </div>
          ))}
          {/* Waits on the read rather than assuming empty, so a couple with
              bills is never told for a beat that they have none. */}
          {!rows.length && (
            <div style={{ padding: "18px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
              {loading ? "Loading your shared bills…" : `No bills yet. Add one and ${name} sees it too.`}
            </div>
          )}
        </div>
        <p className="disc">Both of you get a reminder before a shared bill is due.</p>
      </div>
    </SharedPage>
  );
}
