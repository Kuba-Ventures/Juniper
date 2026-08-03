import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { plans as seedPlans, money, type Plan, type SeriesKey } from "@/lib/mock-data";
import { planMark, cssVar, PlanSpark, PlanIcon } from "@/components/juniper/primitives";

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

  const shown = list.filter((p) => (filter === "all" ? true : filter === "completed" ? p.done : !p.done));

  return (
    <div className="frame">
      <PageHeader
        title="Plans"
        sub="Your money goals — funded from real balances, with the next step always in view."
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

function CreateForm({ state, onBack, onCreate }: { state: { icon: string; label: string; color: SeriesKey }; onBack: () => void; onCreate: (p: Plan) => void }) {
  const isCustom = state.label === "Custom goal";
  const [name, setName] = useState(isCustom ? "" : state.label);
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [date, setDate] = useState("");
  return (
    <Backdrop onClose={onBack}>
      <h3>{isCustom ? "Custom goal" : state.label}</h3>
      <p>Name it and set a target — Juniper starts funding it from your linked accounts.</p>
      <div className="field"><label>Goal name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New car fund" /></div>
      <div className="field2">
        <div className="field"><label>Target amount ($)</label><input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" placeholder="10,000" /></div>
        <div className="field"><label>Monthly</label><input value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="$300/mo" /></div>
      </div>
      <div className="field"><label>Target date</label><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Dec 2027" /></div>
      <div className="modal-actions">
        <button className="btn" onClick={() => onCreate({
          t: name.trim() || state.label, icon: state.icon, ab: (name.trim() || state.label)[0].toUpperCase(),
          k: state.color, saved: 0, target: parseNum(target), pct: 0, st: "new", stl: "New",
          monthly: monthly.trim() || "Not set", date: date.trim() || "No date set", note: "Just created", next: "Add your first contribution",
        })}>Create plan</button>
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
