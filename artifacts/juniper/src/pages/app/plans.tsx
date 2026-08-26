import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/juniper/app-frame";
import { money } from "@/lib/mock-data";
import { useFinances } from "@/lib/finances";
import { useThreads, previewOf, relativeTime } from "@/lib/planner";
import { useSession } from "@/lib/use-session";
import { PartnerPanel } from "@/components/juniper/partner-panel";
import { cssVar, PlanIcon } from "@/components/juniper/primitives";
import {
  useMemberPlans,
  savePlan,
  deletePlan,
  planShape,
  planColor,
  planTitle,
  planNumbers,
  suggestShape,
  uniqueDomain,
  monthsToClose,
  monthLabelFromNow,
  formatTargetDate,
  PLAN_COLORS,
  SHAPE_ICON,
  type Plan,
  type PlanColor,
  type PlanGoal,
  type PlanShape,
} from "@/lib/plans";

// Balances distilled from the member's linked accounts, used to auto-fill a new
// plan so goals are funded from real money instead of guessed inputs.
export interface Balances { totalDebt: number; totalCash: number; totalInvest: number; monthlySpend: number }

interface Prefill { target: number; current: number; hint: string }

// Which real-balance figure a template can seed itself from. Only our own
// templates carry one; a custom goal starts empty because we have no idea what
// it is for.
type PrefillKey = "debt" | "emergency" | "invest" | "cash" | null;

function prefillFor(key: PrefillKey, b: Balances): Prefill {
  const none: Prefill = { target: 0, current: 0, hint: "" };
  switch (key) {
    case "debt":
      return b.totalDebt > 0
        ? { target: b.totalDebt, current: 0, hint: `Your linked balances show ${money(b.totalDebt)} of debt to pay off.` }
        : none;
    case "emergency": {
      const target = Math.round(b.monthlySpend * 6);
      return b.monthlySpend > 0
        ? { target, current: Math.min(b.totalCash, target), hint: `6 months at about ${money(b.monthlySpend)} a month of spending, and you have ${money(b.totalCash)} in cash so far.` }
        : none;
    }
    case "invest":
      return b.totalInvest > 0
        ? { target: 0, current: b.totalInvest, hint: `You have ${money(b.totalInvest)} invested so far, set a target to track your pace.` }
        : none;
    case "cash":
      return b.totalCash > 0
        ? { target: 0, current: 0, hint: `You have ${money(b.totalCash)} in cash that could seed a down payment.` }
        : none;
    default:
      return none;
  }
}

type Filter = "active" | "completed" | "all";
type ModalState =
  | null
  | { k: "new" }
  | { k: "form"; label: string; shape: PlanShape; color: PlanColor; prefill: PrefillKey }
  | { k: "edit"; domain: string };

const TEMPLATES: { label: string; shape: PlanShape; color: PlanColor; prefill: PrefillKey }[] = [
  { label: "Buy a home", shape: "buy", color: "--jnpr-c1", prefill: "cash" },
  { label: "Pay off debt", shape: "payoff", color: "--jnpr-c4", prefill: "debt" },
  { label: "Emergency fund", shape: "save", color: "--jnpr-c3", prefill: "emergency" },
  { label: "Baby and family", shape: "save", color: "--jnpr-c5", prefill: null },
  { label: "Invest for retirement", shape: "save", color: "--jnpr-c2", prefill: "invest" },
  { label: "Custom goal", shape: "save", color: "--jnpr-c6", prefill: null },
];

// Everything a shape changes about how a plan reads: its label in the picker,
// the words on its numbers, and how its finish line is phrased. One table so
// adding a fourth shape later is a single edit, not a hunt through the file.
const SHAPE_COPY: Record<PlanShape, {
  label: string;
  hint: string;
  progressWord: string;
  currentLabel: string;
  targetLabel: string;
  contribVerb: string;
  contribLabel: string;
  readyPrefix: string;
  // The `goal.headline` written for a plan created here, so a shape's framing
  // carries into the one field the rest of the app reads as the plan's summary.
  headline: (name: string, target: number) => string;
}> = {
  save: {
    label: "Saving up",
    hint: "Saving toward a target: travel, a wedding, an emergency fund.",
    progressWord: "saved",
    currentLabel: "Saved so far ($)",
    targetLabel: "Target amount ($)",
    contribVerb: "Saving",
    contribLabel: "Saving each month ($)",
    readyPrefix: "Ready",
    headline: (name, target) => (target > 0 ? `Save ${money(target)} for ${name}` : `Save for ${name}`),
  },
  buy: {
    label: "Buying",
    hint: "A purchase with a down payment: a home, a car, a rental property.",
    progressWord: "of the down payment",
    currentLabel: "Set aside so far ($)",
    targetLabel: "Down payment needed ($)",
    contribVerb: "Putting aside",
    contribLabel: "Putting aside each month ($)",
    readyPrefix: "Ready to buy",
    headline: (name, target) => (target > 0 ? `Put ${money(target)} toward ${name}` : `Save toward ${name}`),
  },
  payoff: {
    label: "Paying off",
    hint: "Paying down a balance: student loans, a credit card.",
    progressWord: "paid off",
    currentLabel: "Paid off so far ($)",
    targetLabel: "Balance to clear ($)",
    contribVerb: "Paying",
    contribLabel: "Paying each month ($)",
    readyPrefix: "Debt-free",
    headline: (name, target) => (target > 0 ? `Clear ${money(target)} on ${name}` : `Pay off ${name}`),
  },
};

const SHAPES: PlanShape[] = ["save", "buy", "payoff"];

const parseNum = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const numStr = (n: number | null | undefined) => (n ? String(Math.round(n * 100) / 100) : "");

// Per-shape FAQs, the questions people actually ask about a goal framed this
// way. They open the AI planner (Ask Juniper) pre-seeded and scoped to the plan.
const FAQS: Record<PlanShape, string[]> = {
  save: ["How much should I set aside each month?", "Where should I keep this money?", "Am I saving fast enough?"],
  buy: ["How much can I afford?", "How big a down payment do I need?", "Should I clear debt before I buy?"],
  payoff: ["What is the fastest way to pay this off?", "Avalanche or snowball for me?", "Should I consolidate or refinance?"],
};

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.7A8 8 0 1121 12z" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
);

/* ------------------------------------------------------------------ *
 * Real plans: one row -> everything the card needs.
 * ------------------------------------------------------------------ */

type PlanView = {
  domain: string;
  title: string;
  shape: PlanShape;
  color: PlanColor;
  current: number;
  target: number;
  pct: number;
  monthly: number | null;
  rate: number | null;
  dateLabel: string | null;
  done: boolean;
  statusClass: "ok" | "new" | "setup" | "done";
  statusLabel: string;
  note: string;
  next: string;
};

function viewOf(plan: Plan): PlanView {
  const shape = planShape(plan);
  const copy = SHAPE_COPY[shape];
  const { current, target, monthly, targetDate, rate } = planNumbers(plan);
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
  const done = plan.status === "completed";

  // A payoff balance keeps accruing, so its finish line has to account for the
  // rate. Saving gets rate 0 on purpose: we do not know what yield the member's
  // cash earns, and inventing one would overstate their pace.
  const months = monthsToClose(remaining, monthly, shape === "payoff" ? (rate ?? 0) : 0);
  const dateLabel = targetDate
    ? `${copy.readyPrefix} ${formatTargetDate(targetDate)}`
    : months != null && months > 0
      ? `${copy.readyPrefix} ${monthLabelFromNow(months)}`
      : null;

  let statusClass: PlanView["statusClass"] = "ok";
  let statusLabel = "On track";
  let next = "";
  if (done) {
    statusClass = "done";
    statusLabel = "Completed";
    next = "Goal reached.";
  } else if (target <= 0) {
    statusClass = "setup";
    statusLabel = "Setup";
    next = `Add a ${shape === "payoff" ? "balance" : "target amount"} so Juniper can track this.`;
  } else if (monthly == null || monthly <= 0) {
    statusClass = "new";
    statusLabel = "New";
    next = "Set a monthly amount to get a finish date.";
  } else {
    next = `Keep ${copy.contribVerb.toLowerCase()} ${money(monthly)} a month to stay on pace.`;
  }

  const note = done
    ? "Completed"
    : target > 0
      ? shape === "payoff"
        ? `${money(remaining)} left${rate != null ? ` at ${rate.toFixed(1)}%` : ""}`
        : `${money(remaining)} to go`
      : "No target set yet";

  return {
    domain: plan.domain, title: planTitle(plan), shape, color: planColor(plan),
    current, target, pct, monthly, rate, dateLabel,
    done, statusClass, statusLabel, note, next,
  };
}

function PlanCard({ v, onOpen, onAsk, chatCount }: { v: PlanView; onOpen: () => void; onAsk: () => void; chatCount: number }) {
  const copy = SHAPE_COPY[v.shape];
  return (
    <div className={`card plan-lg ${v.done ? "done" : ""}`} onClick={onOpen}>
      <div className="ph">
        <div className="track" style={{ background: cssVar(v.color) }}><PlanIcon name={SHAPE_ICON[v.shape]} /></div>
        <div style={{ flex: 1 }}><div className="pt">{v.title}</div><div className="pn">{v.note}</div></div>
        <span className={`status ${v.statusClass}`}>{v.statusLabel}</span>
      </div>
      <div className="body">
        <div className="nums">
          <div className="big tnum">
            {v.target > 0 ? money(v.current) : "Not set"}
            {v.target > 0 ? <small> / {money(v.target)}</small> : null}
          </div>
          <div style={{ fontSize: 12, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>{v.pct}% {copy.progressWord}</div>
        </div>
        <div className="bar"><i style={{ width: `${v.pct}%`, background: cssVar(v.color) }} /></div>
        <div className="plan-meta">
          <span>{copy.contribVerb} <b>{v.monthly ? `${money(v.monthly)}/mo` : "not set"}</b></span>
          {v.dateLabel && <span className="pm-date">{v.dateLabel}</span>}
        </div>
        <div className="next"><b>{v.done ? "Outcome:" : "Next:"}</b> {v.next}</div>
        <div className="plan-foot">
          <span className="edit-hint">Click to view and edit</span>
          <button className="plan-ask" onClick={(e) => { e.stopPropagation(); onAsk(); }}>
            <ChatIcon />Ask Juniper{chatCount > 0 && <span className="pa-badge">{chatCount}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Example plans: illustration, never data.
 *
 * Hard-coded here rather than read from a shared seed, because that is the
 * point: these numbers belong to nobody. They render only in the section at
 * the bottom of this page, are never counted, never filtered, and never reach
 * Overview.
 * ------------------------------------------------------------------ */

type Example = {
  id: string;
  title: string;
  shape: PlanShape;
  color: PlanColor;
  current: number;
  target: number;
  monthly: number;
  blurb: string;
};

const EXAMPLES: Example[] = [
  {
    id: "home", title: "Buy a home", shape: "buy", color: "--jnpr-c1",
    current: 28000, target: 60000, monthly: 850,
    blurb: "A down payment built month by month, with the ready date moving as the balance grows.",
  },
  {
    id: "loans", title: "Pay off student loans", shape: "payoff", color: "--jnpr-c2",
    current: 7600, target: 22400, monthly: 520,
    blurb: "A balance and a rate, turned into a date the debt is actually gone.",
  },
  {
    id: "emergency", title: "Emergency fund", shape: "save", color: "--jnpr-c3",
    current: 7400, target: 21000, monthly: 400,
    blurb: "Six months of spending set aside, sized from what you actually spend.",
  },
  {
    id: "trip", title: "Six months abroad", shape: "save", color: "--jnpr-c5",
    current: 3100, target: 14000, monthly: 450,
    blurb: "Any goal you can name, not just the ones on the template list.",
  },
];

// Dismissals are per member, not per browser: two people on one laptop must not
// inherit each other's choices. Keyed on the Supabase user id, so signing into a
// different account gets its own examples back.
const dismissKey = (userId: string) => `jnpr.plans.examples.dismissed.v1:${userId}`;

function loadDismissed(userId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveDismissed(userId: string, ids: string[]) {
  try {
    localStorage.setItem(dismissKey(userId), JSON.stringify(ids));
  } catch {
    /* quota or private mode: the dismissal holds for this session only */
  }
}

function ExampleCard({ e, onDismiss }: { e: Example; onDismiss: () => void }) {
  const copy = SHAPE_COPY[e.shape];
  const pct = Math.min(100, Math.round((e.current / e.target) * 100));
  return (
    <div className="card plan-ex">
      <button className="ex-x" onClick={onDismiss} aria-label={`Dismiss the ${e.title} example`}>
        <CloseIcon />
      </button>
      <div className="ex-top">
        <span className="ex-ic" style={{ background: cssVar(e.color) }}><PlanIcon name={SHAPE_ICON[e.shape]} /></span>
        <div className="ex-head-txt">
          <div className="ex-t">{e.title}</div>
          <div className="ex-s tnum">{money(e.current)} of {money(e.target)} {copy.progressWord} · {money(e.monthly)}/mo</div>
        </div>
      </div>
      <div className="bar"><i style={{ width: `${pct}%`, background: cssVar(e.color) }} /></div>
      <p className="ex-b">{e.blurb}</p>
    </div>
  );
}

function ExampleSection({ userId }: { userId: string }) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed(userId));

  // Re-read when the signed-in member changes, so switching accounts in one
  // browser does not carry the previous member's dismissals over.
  useEffect(() => { setDismissed(loadDismissed(userId)); }, [userId]);

  const shown = EXAMPLES.filter((e) => !dismissed.includes(e.id));
  if (!shown.length) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    saveDismissed(userId, next);
  };

  return (
    <section className="ex-wrap">
      <div className="ex-lede">
        <h3>Example plans</h3>
        <p>Not your data. A few common goals, here to show how a plan tracks. Dismiss any you do not want to see again.</p>
      </div>
      <div className="grid ex-grid">
        {shown.map((e) => <ExampleCard key={e.id} e={e} onDismiss={() => dismiss(e.id)} />)}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Shared form bits.
 * ------------------------------------------------------------------ */

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ShapePicker({ value, onChange }: { value: PlanShape; onChange: (s: PlanShape) => void }) {
  return (
    <div className="field">
      <label>Plan shape</label>
      <div className="shape-pick" role="group" aria-label="Plan shape">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            className={`shape-btn ${value === s ? "on" : ""}`}
            aria-pressed={value === s}
            onClick={() => onChange(s)}
          >
            <span className="sb-ic"><PlanIcon name={SHAPE_ICON[s]} /></span>
            {SHAPE_COPY[s].label}
          </button>
        ))}
      </div>
      <span className="field-hint">{SHAPE_COPY[value].hint}</span>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: PlanColor; onChange: (c: PlanColor) => void }) {
  return (
    <div className="field">
      <label>Color</label>
      <div className="color-pick" role="group" aria-label="Plan color">
        {PLAN_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            className={`swatch ${value === c ? "on" : ""}`}
            style={{ background: cssVar(c) }}
            aria-pressed={value === c}
            aria-label={`Color ${i + 1}`}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

// The fields shared by create and edit, so the two forms cannot drift into
// disagreeing about what a plan holds.
type Draft = {
  name: string;
  shape: PlanShape;
  color: PlanColor;
  current: string;
  target: string;
  monthly: string;
  date: string;
  rate: string;
};

function DraftFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const copy = SHAPE_COPY[draft.shape];
  return (
    <>
      <div className="field">
        <label>Goal name</label>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. New car fund" />
      </div>
      <ShapePicker value={draft.shape} onChange={(shape) => set({ shape })} />
      <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
      <div className="field2">
        <div className="field"><label>{copy.targetLabel}</label><input value={draft.target} onChange={(e) => set({ target: e.target.value })} inputMode="numeric" placeholder="10,000" /></div>
        <div className="field"><label>{copy.currentLabel}</label><input value={draft.current} onChange={(e) => set({ current: e.target.value })} inputMode="numeric" placeholder="0" /></div>
      </div>
      <div className="field2">
        <div className="field"><label>{copy.contribLabel}</label><input value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} inputMode="numeric" placeholder="300" /></div>
        {draft.shape === "payoff"
          ? <div className="field"><label>Rate (% a year)</label><input value={draft.rate} onChange={(e) => set({ rate: e.target.value })} inputMode="decimal" placeholder="22.9" /></div>
          : <div className="field"><label>Target date (optional)</label><input value={draft.date} onChange={(e) => set({ date: e.target.value })} placeholder="Dec 2027" /></div>}
      </div>
      {draft.shape === "payoff" && (
        <div className="field"><label>Target date (optional)</label><input value={draft.date} onChange={(e) => set({ date: e.target.value })} placeholder="Dec 2029" /></div>
      )}
    </>
  );
}

// Build the `goal` payload from a draft. Merges over whatever the row already
// holds so a plan written by the guided dialogue keeps its summary, milestones
// wording, and its own headline: this page only owns the fields it shows.
function goalFrom(draft: Draft, existing: PlanGoal | null): PlanGoal {
  const target = parseNum(draft.target);
  const current = parseNum(draft.current);
  const monthly = parseNum(draft.monthly);
  const rate = parseNum(draft.rate);
  const name = draft.name.trim();
  const copy = SHAPE_COPY[draft.shape];

  // Only write a headline when the row has none. Overwriting one would throw
  // away the synthesis text a dialogue-built plan opens with.
  const headline = existing?.headline?.trim() ? existing.headline : copy.headline(name, target);

  const goal: PlanGoal = {
    ...(existing ?? {}),
    headline,
    name,
    shape: draft.shape,
    color: draft.color,
    target_value: target,
    current_value: current,
    monthly_contribution: monthly,
  };
  // POST replaces the whole `goal` object, so a field the member cleared has to
  // be deleted here rather than left to fall through from `existing`.
  const date = draft.date.trim();
  if (date) goal.target_date = date; else delete goal.target_date;
  if (draft.shape === "payoff" && rate > 0) goal.rate = rate; else delete goal.rate;
  return goal;
}

/* ------------------------------------------------------------------ *
 * Page.
 * ------------------------------------------------------------------ */

export default function Plans() {
  const { plans, loading, upsertLocal, removeLocal } = useMemberPlans();
  const [filter, setFilter] = useState<Filter>("active");
  const [modal, setModal] = useState<ModalState>(null);
  const close = () => setModal(null);
  const [, navigate] = useLocation();
  const { threads } = useThreads();
  const session = useSession();
  const chatCountFor = (t: string) => threads.filter((x) => x.planTitle === t).length;

  const { data, source } = useFinances();
  const balances: Balances = {
    totalDebt: data.accounts.debt.reduce((a, x) => a + Math.abs(x.v), 0),
    totalCash: data.accounts.cash.reduce((a, x) => a + x.v, 0),
    totalInvest: data.accounts.invest.reduce((a, x) => a + x.v, 0),
    monthlySpend: data.cashflow.spent,
  };
  const linked = source === "live";

  const views = useMemo(() => plans.map(viewOf), [plans]);
  const shown = views.filter((v) => (filter === "all" ? true : filter === "completed" ? v.done : !v.done));
  const editing = modal?.k === "edit" ? plans.find((p) => p.domain === modal.domain) ?? null : null;

  return (
    <div className="frame">
      <PageHeader
        title="Plans"
        sub={linked ? "Your money goals, funded from your linked balances, with the next step always in view." : "Your money goals, with the next step always in view."}
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

      {loading ? (
        <div className="grid plan-grid">
          <div className="card plan-skel" aria-busy="true">Loading your plans…</div>
          <div className="card plan-skel" aria-hidden="true" />
        </div>
      ) : views.length === 0 ? (
        // A genuine empty state. Nothing stands in for the member's plans, and
        // the examples further down the page are labelled as not theirs.
        <div className="card plan-empty">
          <span className="pe-ic"><PlanIcon name="target" /></span>
          <h3>No plans yet</h3>
          <p>A plan turns one goal into a target, a monthly amount, and a date. Start with something you are already saving for or paying down.</p>
          <button className="btn" onClick={() => setModal({ k: "new" })}><PlusIcon />New plan</button>
        </div>
      ) : (
        <div className="grid plan-grid">
          {shown.length ? (
            shown.map((v) => (
              <PlanCard
                key={v.domain}
                v={v}
                chatCount={chatCountFor(v.title)}
                onOpen={() => setModal({ k: "edit", domain: v.domain })}
                onAsk={() => navigate(`/app/ask?plan=${encodeURIComponent(v.title)}`)}
              />
            ))
          ) : (
            <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>
              No {filter} plans.
            </div>
          )}
        </div>
      )}

      {/* Examples sit last, below the member's own plans, and only once we know
          who is signed in (the dismissal list is per account). */}
      {session?.user.id && <ExampleSection userId={session.user.id} />}

      {modal?.k === "new" && (
        <Backdrop onClose={close}>
          <h3>Start a new plan</h3>
          <p>Pick a starting point. Juniper seeds the numbers from your linked accounts where it can, and you can change anything.</p>
          <div className="tmpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.label} className="tmpl" onClick={() => setModal({ k: "form", label: t.label, shape: t.shape, color: t.color, prefill: t.prefill })}>
                <span className="tmpl-ic" style={{ background: cssVar(t.color) }}><PlanIcon name={SHAPE_ICON[t.shape]} /></span>{t.label}
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
          prefill={prefillFor(modal.prefill, balances)}
          existing={plans}
          onBack={() => setModal({ k: "new" })}
          onCreated={(plan) => { upsertLocal(plan); setFilter("active"); close(); }}
        />
      )}

      {editing && (
        <EditForm
          plan={editing}
          onSaved={(plan) => { upsertLocal(plan); close(); }}
          onDeleted={(domain) => { removeLocal(domain); close(); }}
          onClose={close}
        />
      )}
    </div>
  );
}

function CreateForm({
  state, prefill, existing, onBack, onCreated,
}: {
  state: { label: string; shape: PlanShape; color: PlanColor };
  prefill: Prefill;
  existing: Plan[];
  onBack: () => void;
  onCreated: (p: Plan) => void;
}) {
  const isCustom = state.label === "Custom goal";
  const [draft, setDraft] = useState<Draft>({
    name: isCustom ? "" : state.label,
    shape: state.shape,
    color: state.color,
    current: numStr(prefill.current),
    target: numStr(prefill.target),
    monthly: "",
    date: "",
    rate: "",
  });
  // Whether the member has touched the shape control. On a custom goal, until
  // they do, a typed name re-runs the keyword guess, so "nomad" lands on save
  // and "car loan" lands on payoff without them having to think about it. A
  // template already carries its own shape, which is a better signal than
  // anything a keyword scan of its label would produce.
  const [shapePinned, setShapePinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.shape) return next;
      if (isCustom && patch.name !== undefined && !shapePinned) next.shape = suggestShape(patch.name);
      return next;
    });
    if (patch.shape) setShapePinned(true);
  };

  const create = async () => {
    const name = draft.name.trim() || state.label;
    setSaving(true);
    setError("");
    // `domain` is the plan's key and is fixed here for the row's whole life:
    // renaming later rewrites goal.name and leaves the key alone.
    const saved = await savePlan({
      domain: uniqueDomain(name, existing),
      status: "in_progress",
      goal: goalFrom({ ...draft, name }, null),
    });
    setSaving(false);
    if (!saved) {
      setError("That did not save. Check your connection and try again.");
      return;
    }
    onCreated(saved);
  };

  return (
    <Backdrop onClose={onBack}>
      <h3>{isCustom ? "Custom goal" : state.label}</h3>
      <p>Name it, pick how it works, and set a target. You can change all of it later.</p>
      {prefill.hint && (
        <div className="prefill-hint"><PlanIcon name="target" /><span>{prefill.hint}</span></div>
      )}
      {error && <div className="form-error">{error}</div>}
      <DraftFields draft={draft} set={set} />
      <div className="modal-actions">
        <button className="btn" disabled={saving} onClick={create}>{saving ? "Creating…" : "Create plan"}</button>
        <button className="btn ghost" disabled={saving} onClick={onBack}>Back</button>
      </div>
    </Backdrop>
  );
}

function EditForm({
  plan, onSaved, onDeleted, onClose,
}: {
  plan: Plan;
  onSaved: (p: Plan) => void;
  onDeleted: (domain: string) => void;
  onClose: () => void;
}) {
  const title = planTitle(plan);
  const nums = planNumbers(plan);
  const [draft, setDraft] = useState<Draft>({
    name: title,
    shape: planShape(plan),
    color: planColor(plan),
    current: numStr(nums.current),
    target: numStr(nums.target),
    monthly: numStr(nums.monthly),
    date: nums.targetDate ?? "",
    rate: numStr(nums.rate),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, navigate] = useLocation();
  const { threads } = useThreads();
  const chats = threads.filter((t) => t.planTitle === title);
  const ask = (q: string) => navigate(`/app/ask?q=${encodeURIComponent(q)}&plan=${encodeURIComponent(title)}`);
  const newChat = () => navigate(`/app/ask?plan=${encodeURIComponent(title)}`);
  const openChat = (id: string) => navigate(`/app/ask?thread=${encodeURIComponent(id)}`);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const write = async (extra: { status?: Plan["status"] } = {}) => {
    setBusy(true);
    setError("");
    const saved = await savePlan({
      domain: plan.domain,
      ...extra,
      goal: goalFrom({ ...draft, name: draft.name.trim() || title }, plan.goal),
    });
    setBusy(false);
    if (!saved) {
      setError("That did not save. Check your connection and try again.");
      return;
    }
    onSaved(saved);
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const ok = await deletePlan(plan.domain);
    setBusy(false);
    if (!ok) {
      setError("That did not delete. Check your connection and try again.");
      return;
    }
    onDeleted(plan.domain);
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="ask-plan-cta">
        <div className="ask-plan-head">
          <div><b>Ask Juniper about this plan</b><small>Grounded in your real numbers</small></div>
          <button className="btn sm" onClick={newChat}>New chat</button>
        </div>
        <div className="ask-faqs">
          {FAQS[planShape(plan)].map((q) => <button key={q} className="ask-faq" onClick={() => ask(q)}>{q}</button>)}
        </div>
      </div>

      {chats.length > 0 && (
        <div className="plan-chats">
          <div className="pc-lbl">Conversations about this plan</div>
          {chats.map((t) => (
            <button className="pc-item" key={t.id} onClick={() => openChat(t.id)}>
              <span className="pc-berry"><PlanIcon name="target" /></span>
              <span className="pc-main">
                <span className="pc-t">{t.title}</span>
                {previewOf(t) && <span className="pc-p">{previewOf(t)}</span>}
              </span>
              <span className="pc-w">{relativeTime(t.updatedAt)}</span>
              <span className="pc-arr">›</span>
            </button>
          ))}
        </div>
      )}

      <h3>Edit plan</h3>
      <p>Update the goal, mark it done, or remove it. Changes save to your account.</p>
      {error && <div className="form-error">{error}</div>}
      <DraftFields draft={draft} set={set} />
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => write()}>{busy ? "Saving…" : "Save changes"}</button>
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => write({ status: plan.status === "completed" ? "in_progress" : "completed" })}
        >
          {plan.status === "completed" ? "Reopen" : "Mark complete"}
        </button>
      </div>
      <div className="modal-danger">
        {confirmDelete ? (
          <>
            <span>Delete this plan for good?</span>
            <button className="btn ghost sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button className="btn ghost sm danger" disabled={busy} onClick={remove}>Delete</button>
          </>
        ) : (
          <button className="btn ghost sm danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete plan</button>
        )}
      </div>
    </Backdrop>
  );
}
