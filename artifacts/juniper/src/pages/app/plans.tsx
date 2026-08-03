import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { plans as seedPlans, money, type Plan, type SeriesKey } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { PartnerPanel } from "@/components/juniper/partner-panel";
import { planMark, cssVar, PlanSpark, PlanIcon } from "@/components/juniper/primitives";

// Balances distilled from the member's linked accounts, used to auto-fill a new
// plan so goals are funded from real money instead of guessed inputs.
export interface Balances { totalDebt: number; totalCash: number; totalInvest: number; monthlySpend: number }

interface Prefill { target: number; saved: number; hint: string }

// What to seed a new plan's fields with, per template, from real balances.
function prefillFor(icon: string, b: Balances): Prefill {
  switch (icon) {
    case "debt":
      return b.totalDebt > 0
        ? { target: b.totalDebt, saved: 0, hint: `Your linked balances show ${money(b.totalDebt)} of debt to pay off.` }
        : { target: 0, saved: 0, hint: "" };
    case "shield": {
      const target = Math.round(b.monthlySpend * 6);
      return b.monthlySpend > 0
        ? { target, saved: Math.min(b.totalCash, target), hint: `6 months at ~${money(b.monthlySpend)}/mo spending — you have ${money(b.totalCash)} in cash so far.` }
        : { target: 0, saved: 0, hint: "" };
    }
    case "sun":
      return b.totalInvest > 0
        ? { target: 0, saved: b.totalInvest, hint: `You have ${money(b.totalInvest)} invested so far — set a target to track your pace.` }
        : { target: 0, saved: 0, hint: "" };
    case "home":
      return b.totalCash > 0
        ? { target: 0, saved: 0, hint: `You have ${money(b.totalCash)} in cash that could seed a down payment.` }
        : { target: 0, saved: 0, hint: "" };
    default:
      return { target: 0, saved: 0, hint: "" };
  }
}

type Filter = "active" | "completed" | "all";
type ModalState =
  | null
  | { k: "new" }
  | { k: "form"; icon: string; label: string; color: SeriesKey }
  | { k: "edit"; i: number };

const TEMPLATES: [string, string, SeriesKey][] = [
  ["home", "Buy a home", "--jnpr-c1"],
  ["debt", "Pay off debt", "--jnpr-c4"],
  ["shield", "Emergency fund", "--jnpr-c3"],
  ["baby", "Baby & family", "--jnpr-c5"],
  ["sun", "Retirement", "--jnpr-c2"],
  ["target", "Custom goal", "--jnpr-c6"],
];

const parseNum = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
);

function PlanCard({ p, onOpen }: { p: Plan; onOpen: () => void }) {
  const prog = p.target ? Math.round((p.saved / p.target) * 100) : p.pct;
  return (
    <div className={`card plan-lg ${p.done ? "done" : ""}`} onClick={onOpen}>
      <div className="ph">
        <div className="track" style={{ background: cssVar(p.k) }}>{planMark(p)}</div>
        <div style={{ flex: 1 }}><div className="pt">{p.t}</div><div className="pn">{p.note}</div></div>
        <span className={`status ${p.st}`}>{p.stl}</span>
      </div>
      <div className="body">
        <div className="nums">
          <div className="big tnum">{p.target ? money(p.saved) : `${prog}%`}{p.target ? <small> / {money(p.target)}</small> : null}</div>
          <div style={{ fontSize: 12, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>{prog}% funded</div>
        </div>
        <div className="bar"><i style={{ width: `${prog}%`, background: cssVar(p.k) }} /></div>
        {p.traj && <div className="plan-spark"><PlanSpark data={p.traj} k={p.k} /></div>}
        {p.monthly && (
          <div className="plan-meta">
            <span>{p.down ? "Paying" : p.done ? "Saved" : "Saving"} <b>{p.monthly}</b></span>
            <span className="pm-date">{p.date}</span>
          </div>
        )}
        <div className="next"><b>{p.done ? "Outcome:" : "Next:"}</b> {p.next}</div>
        <div className="edit-hint">Click to view &amp; edit →</div>
      </div>
      {p.rec && (
        <div className="embed-rec">
          <div className="save tnum">${p.rec.save}<small>/yr</small></div>
          <div className="eb">
            <h4>{p.rec.h}</h4><p>{p.rec.p}</p>
            <div className="cta">
              <button className="btn sm" onClick={(e) => e.stopPropagation()}>See offer</button>
              <span className="partner">via <b>{p.rec.partner}</b></span>
            </div>
          </div>
        </div>
      )}
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

export default function Plans() {
  const [list, setList] = useState<Plan[]>(() => seedPlans.map((p) => ({ ...p })));
  const [filter, setFilter] = useState<Filter>("active");
  const [modal, setModal] = useState<ModalState>(null);
  const close = () => setModal(null);

  const { data, source } = useFinances();
  const balances: Balances = {
    totalDebt: data.accounts.debt.reduce((a, x) => a + Math.abs(x.v), 0),
    totalCash: data.accounts.cash.reduce((a, x) => a + x.v, 0),
    totalInvest: data.accounts.invest.reduce((a, x) => a + x.v, 0),
    monthlySpend: data.cashflow.spent,
  };
  const linked = source === "live";

  const shown = list.filter((p) => (filter === "all" ? true : filter === "completed" ? p.done : !p.done));

  return (
    <div className="frame">
      <PageHeader
        title="Plans"
        sub={linked ? "Your money goals, funded from your linked balances — with the next step always in view." : "Your money goals — funded from real balances, with the next step always in view."}
        actions={
          <>
            <div className="pills">
              {(["active", "completed", "all"] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? "on" : undefined} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setModal({ k: "new" })}><PlusIcon />New plan</button>
          </>
        }
      />

      <PartnerPanel />

      <div className="grid plan-grid">
        {shown.length ? (
          shown.map((p) => <PlanCard key={list.indexOf(p)} p={p} onOpen={() => setModal({ k: "edit", i: list.indexOf(p) })} />)
        ) : (
          <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>No {filter} plans yet.</div>
        )}
      </div>
      <p className="disc">Recommendations appear inside a plan only when a specific offer would move that plan forward — like a lower-rate balance transfer on your debt payoff. Juniper may earn a commission on offers you open; they're ranked by benefit to you, not payout.</p>

      {modal?.k === "new" && (
        <Backdrop onClose={close}>
          <h3>Start a new plan</h3>
          <p>Pick a goal — Juniper builds the plan and funds it from your linked accounts.</p>
          <div className="tmpl-grid">
            {TEMPLATES.map(([icon, label, color]) => (
              <button key={label} className="tmpl" onClick={() => setModal({ k: "form", icon, label, color })}>
                <span className="tmpl-ic" style={{ background: cssVar(color) }}><PlanIcon name={icon} /></span>{label}
              </button>
            ))}
          </div>
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={close}>Cancel</button>
          </div>
        </Backdrop>
      )}

      {modal?.k === "form" && (
        <CreateForm
          state={modal}
          prefill={prefillFor(modal.icon, balances)}
          onBack={() => setModal({ k: "new" })}
          onCreate={(plan) => { setList((cur) => [plan, ...cur]); setFilter("active"); close(); }}
        />
      )}

      {modal?.k === "edit" && (
        <EditForm
          plan={list[modal.i]}
          onSave={(patch) => { setList((cur) => cur.map((p, idx) => (idx === modal.i ? { ...p, ...patch } : p))); close(); }}
          onDelete={() => { setList((cur) => cur.filter((_, idx) => idx !== modal.i)); close(); }}
          onClose={close}
        />
      )}
    </div>
  );
}

function CreateForm({ state, prefill, onBack, onCreate }: { state: { icon: string; label: string; color: SeriesKey }; prefill: Prefill; onBack: () => void; onCreate: (p: Plan) => void }) {
  const isCustom = state.label === "Custom goal";
  const [name, setName] = useState(isCustom ? "" : state.label);
  const [target, setTarget] = useState(prefill.target ? String(prefill.target) : "");
  const [saved, setSaved] = useState(prefill.saved ? String(prefill.saved) : "");
  const [monthly, setMonthly] = useState("");
  const [date, setDate] = useState("");
  return (
    <Backdrop onClose={onBack}>
      <h3>{isCustom ? "Custom goal" : state.label}</h3>
      <p>Name it and set a target — Juniper starts funding it from your linked accounts.</p>
      {prefill.hint && (
        <div className="prefill-hint"><PlanIcon name="target" /><span>{prefill.hint}</span></div>
      )}
      <div className="field"><label>Goal name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New car fund" /></div>
      <div className="field2">
        <div className="field"><label>Target amount ($)</label><input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" placeholder="10,000" /></div>
        <div className="field"><label>Saved so far ($)</label><input value={saved} onChange={(e) => setSaved(e.target.value)} inputMode="numeric" placeholder="0" /></div>
      </div>
      <div className="field2">
        <div className="field"><label>Monthly</label><input value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="$300/mo" /></div>
        <div className="field"><label>Target date</label><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Dec 2027" /></div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={() => {
          const t = parseNum(target), s = parseNum(saved);
          onCreate({
            t: name.trim() || state.label, icon: state.icon, ab: (name.trim() || state.label)[0].toUpperCase(),
            k: state.color, saved: s, target: t, pct: t ? Math.round((s / t) * 100) : 0, st: "new", stl: "New",
            monthly: monthly.trim() || "Not set", date: date.trim() || "No date set",
            note: s > 0 ? "Funded from your accounts" : "Just created",
            next: s > 0 ? "Keep contributing to stay on pace" : "Add your first contribution",
          });
        }}>Create plan</button>
        <button className="btn ghost" onClick={onBack}>Back</button>
      </div>
    </Backdrop>
  );
}

function EditForm({ plan, onSave, onDelete, onClose }: { plan: Plan; onSave: (p: Partial<Plan>) => void; onDelete: () => void; onClose: () => void }) {
  const [name, setName] = useState(plan.t);
  const [saved, setSaved] = useState(String(plan.saved || 0));
  const [target, setTarget] = useState(String(plan.target || 0));
  const [monthly, setMonthly] = useState(plan.monthly || "");
  const [date, setDate] = useState(plan.date || "");
  return (
    <Backdrop onClose={onClose}>
      <h3>Edit plan</h3>
      <p>Update the goal or remove it. Progress is funded from your linked accounts.</p>
      <div className="field"><label>Goal name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field2">
        <div className="field"><label>Saved so far ($)</label><input value={saved} onChange={(e) => setSaved(e.target.value)} /></div>
        <div className="field"><label>Target ($)</label><input value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      </div>
      <div className="field2">
        <div className="field"><label>Monthly</label><input value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
        <div className="field"><label>Target date</label><input value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={() => {
          const t = parseNum(target), s = parseNum(saved);
          onSave({ t: name.trim() || plan.t, saved: s, target: t, monthly: monthly.trim(), date: date.trim(), pct: t ? Math.round((s / t) * 100) : plan.pct });
        }}>Save changes</button>
        <button className="btn ghost" style={{ flex: "0 0 auto", color: "var(--jnpr-bad)" }} onClick={onDelete}>Delete</button>
      </div>
    </Backdrop>
  );
}
