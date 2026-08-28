// Shared goals: what the two of you are funding together, and who has put in
// what. This is the page the partner half of the product exists for, and until
// Stage 4d it was the one shared page with no live branch at all: it rendered a
// seeded household's goals and an "Add contribution" button that did nothing.
//
// Everything here is now /api/partner. A partnership with no goals yet gets an
// empty state and the form, not somebody else's goals.
import { useState } from "react";
import { money, moneyK } from "@/lib/mock-data";
import { cssVar, planMark } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { usePartner, addSharedGoal, addContribution, type PartnerGoal } from "@/lib/partner";

// The plan palette, cycled so two goals never share a colour by accident.
const CYCLE = ["--jnpr-c1", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c3"];
const YOU_COLOR = "--jnpr-c3";
const THEM_COLOR = "--jnpr-c5";

function GoalCard({ goal, k, name, onContribute }: { goal: PartnerGoal; k: string; name: string; onContribute: (g: PartnerGoal) => void }) {
  const funded = goal.you + goal.partner;
  // A target of zero would divide by nothing and draw a full bar for an empty
  // goal, so it reads as "no target yet" instead.
  const pct = goal.target > 0 ? Math.round((funded / goal.target) * 100) : 0;
  const width = (v: number) => (goal.target > 0 ? `${Math.min(100, (v / goal.target) * 100)}%` : "0%");
  return (
    <div className="card plan-lg">
      <div className="ph">
        <div className="track" style={{ background: cssVar(k) }}>{planMark({ icon: goal.icon, ab: goal.t[0] })}</div>
        <div style={{ flex: 1 }}>
          <div className="pt">{goal.t}</div>
          <div className="pn">
            {goal.target > 0 ? `${pct}% funded · ${money(Math.max(0, goal.target - funded))} to go` : "No target set yet"}
          </div>
        </div>
      </div>
      <div className="body">
        <div className="nums">
          <div className="big tnum">
            {money(funded)} {goal.target > 0 && <small>/ {money(goal.target)}</small>}
          </div>
        </div>
        <div className="bar">
          <i style={{ width: width(goal.you), background: cssVar(YOU_COLOR) }} />
          <i style={{ width: width(goal.partner), background: cssVar(THEM_COLOR) }} />
        </div>
        <div className="contrib" style={{ marginTop: 9 }}>
          <span><span className="dot" style={{ background: cssVar(YOU_COLOR) }} /> You <b className="tnum">{moneyK(goal.you)}</b></span>
          <span><span className="dot" style={{ background: cssVar(THEM_COLOR) }} /> {name} <b className="tnum">{moneyK(goal.partner)}</b></span>
        </div>
        <div className="plan-meta" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => onContribute(goal)}>Add contribution</button>
        </div>
      </div>
    </div>
  );
}

export function SharedGoals() {
  const { partner } = useWorkspace();
  const { data, refresh } = usePartner();
  const [adding, setAdding] = useState(false);
  const [contributing, setContributing] = useState<PartnerGoal | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = partner.name || data?.partner?.name || "your partner";
  const goals = data?.goals ?? [];

  const num = (v: string) => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const submitGoal = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    // Icon defaults server-side to "target"; planMark falls back to the goal's
    // first letter for anything it does not have art for, so an unknown icon is
    // a plain monogram rather than a hole in the card.
    const res = await addSharedGoal(title.trim(), "target", num(target));
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not save that goal.");
      return;
    }
    setTitle("");
    setTarget("");
    setAdding(false);
    refresh();
  };

  const submitContribution = async () => {
    if (!contributing) return;
    const value = num(amount);
    if (value <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await addContribution(contributing.id, value);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not record that.");
      return;
    }
    setAmount("");
    setContributing(null);
    refresh();
  };

  return (
    <SharedPage title="Shared goals" sub="Goals you're funding together, with each person's contribution.">
      {goals.length === 0 ? (
        <div className="card pad-lg" style={{ textAlign: "center" }}>
          <h3 style={{ marginBottom: 6 }}>Nothing shared yet</h3>
          <p className="sub" style={{ margin: "0 auto 14px", maxWidth: 420 }}>
            A shared goal is one you are both putting money toward. Each contribution is recorded
            against the person who made it, so the split is always visible.
          </p>
          <button className="btn" onClick={() => setAdding(true)}>New shared goal</button>
        </div>
      ) : (
        <>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h3>{goals.length} shared {goals.length === 1 ? "goal" : "goals"}</h3>
            <button className="btn ghost sm" onClick={() => setAdding(true)}>New shared goal</button>
          </div>
          <div className="grid two">
            {goals.map((g, i) => (
              <GoalCard key={g.id} goal={g} k={CYCLE[i % CYCLE.length]} name={name} onContribute={setContributing} />
            ))}
          </div>
        </>
      )}

      {adding && (
        <div className="modal-scrim" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New shared goal</h3>
            <p className="sub">Both of you will see it, and every contribution is attributed.</p>
            <div className="form-col">
              <label>Goal name</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. House deposit" autoFocus />
              <label>Target amount ($)</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="40,000" inputMode="decimal" />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn" onClick={submitGoal} disabled={busy || !title.trim()}>
                {busy ? "Saving…" : "Create goal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {contributing && (
        <div className="modal-scrim" onClick={() => setContributing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add to {contributing.t}</h3>
            <p className="sub">Recorded as yours, so the split stays honest.</p>
            <div className="form-col">
              <label>Amount ($)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" inputMode="decimal" autoFocus />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setContributing(null)}>Cancel</button>
              <button className="btn" onClick={submitContribution} disabled={busy}>{busy ? "Saving…" : "Add"}</button>
            </div>
          </div>
        </div>
      )}

      <p className="disc">
        Shared goals are always visible to both of you, that is the point. Your own goals stay on your
        private Plans page.
      </p>
    </SharedPage>
  );
}
