import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useThreads, runTurn, pageContextFor, isPageContext, PAGE_CONTEXTS, titleFrom, generateReport,
  extractPlanDraft, setPendingChatDraft, type Thread, type PlanDraftFromChat,
} from "@/lib/planner";
import { PlanReportView } from "@/components/juniper/plan-report";
import { useMemberPlans, savePlan, uniqueDomain, planTitle, type PlanGoal } from "@/lib/plans";
import { money } from "@/lib/mock-data";

// Global starter prompts (the standalone surface). Plan-scoped chats arrive
// pre-seeded with a question from the Plans page, so they skip this screen.
const STARTERS = [
  "How do I open a high-yield savings account or a brokerage?",
  "Can I afford to buy a home this year?",
  "What's the smartest way to pay down my debt?",
  "How should I split saving for a baby and a down payment?",
];

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Very light **bold** + paragraph rendering, enough for planner replies.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} style={{ margin: i ? "10px 0 0" : 0 }}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
            p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
          )}
        </p>
      ))}
    </>
  );
}

export default function Ask() {
  const { threads, create, remove, update } = useThreads();
  const { plans, upsertLocal } = useMemberPlans();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // "Track this as a plan" (issue #262): a draft extracted from the thread,
  // previewed in place before it becomes a real row. `planCreated` is the
  // confirmation shown after "Looks right, create it", separate from
  // `planDraft` so the preview and its aftermath are never on screen at once.
  const [planDraft, setPlanDraft] = useState<PlanDraftFromChat | null>(null);
  const [planDraftBusy, setPlanDraftBusy] = useState(false);
  const [planDraftErr, setPlanDraftErr] = useState(false);
  const [planCreated, setPlanCreated] = useState<{ domain: string; title: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const search = useSearch();
  const [, navigate] = useLocation();
  const seeded = useRef(false);

  const active: Thread | undefined = threads.find((t) => t.id === activeId);

  // Reset the report overlay and any plan draft when switching threads: a
  // draft extracted from one conversation has no business surviving onto
  // another.
  useEffect(() => {
    setShowReport(false);
    setReportErr(false);
    setPlanDraft(null);
    setPlanDraftErr(false);
    setPlanCreated(null);
  }, [activeId]);

  async function makePlanDraft() {
    if (!active || planDraftBusy) return;
    setPlanDraftBusy(true);
    setPlanDraftErr(false);
    setPlanCreated(null);
    try {
      const draft = await extractPlanDraft(active.messages, active.planContext);
      setPlanDraft(draft);
    } catch {
      setPlanDraftErr(true);
    } finally {
      setPlanDraftBusy(false);
    }
  }

  // "Looks right, create it": writes the row directly, the same call the
  // Plans page's own quick-start makes, so a draft the member accepts as-is
  // never has to detour through a form just to be confirmed twice.
  async function createFromDraft() {
    if (!planDraft || planDraftBusy) return;
    setPlanDraftBusy(true);
    setPlanDraftErr(false);
    const goal: PlanGoal = { headline: planDraft.name, name: planDraft.name, shape: planDraft.shape };
    if (planDraft.target_value != null) goal.target_value = planDraft.target_value;
    if (planDraft.current_value != null) goal.current_value = planDraft.current_value;
    if (planDraft.monthly_contribution != null) goal.monthly_contribution = planDraft.monthly_contribution;
    if (planDraft.rate != null && planDraft.shape === "payoff") goal.rate = planDraft.rate;
    if (planDraft.target_date) goal.target_date = planDraft.target_date;
    const saved = await savePlan({ domain: uniqueDomain(planDraft.name, plans), status: "in_progress", goal });
    setPlanDraftBusy(false);
    if (!saved) {
      setPlanDraftErr(true);
      return;
    }
    upsertLocal(saved);
    setPlanCreated({ domain: saved.domain, title: planTitle(saved) });
    setPlanDraft(null);
  }

  // "Adjust first": hands the same draft to the real create form on Plans,
  // marked as from-conversation there too, rather than building a second
  // place that can edit a plan's numbers.
  function adjustDraft() {
    if (!planDraft) return;
    setPendingChatDraft(planDraft);
    navigate("/app/plans?fromChat=1");
  }

  async function makeReport() {
    if (!active || reportBusy) return;
    setReportBusy(true);
    setReportErr(false);
    try {
      const report = await generateReport(active.messages, active.planContext);
      update(active.id, (x) => ({ ...x, report, updatedAt: Date.now() }));
      setShowReport(true);
    } catch {
      setReportErr(true);
    } finally {
      setReportBusy(false);
    }
  }

  // Deep links, from a plan or from the app-bar icon (issue #263):
  //   ?thread=<id>        → open an existing chat
  //   ?q=…&plan=…         → new plan-scoped chat, auto-ask the question
  //   ?plan=…             → new, empty plan-scoped chat, ready to type
  //   ?from=<route>       → new chat grounded in whatever page the icon was
  //                         pressed from (pageContextFor); no useful context
  //                         for that route means nothing to seed, so it just
  //                         lands on the welcome screen instead
  useEffect(() => {
    if (seeded.current) return;
    const params = new URLSearchParams(search);
    const threadId = params.get("thread");
    const q = params.get("q");
    const plan = params.get("plan") || undefined;
    const from = params.get("from") || undefined;
    if (!threadId && !q && !plan && !from) return;
    seeded.current = true;

    if (threadId) {
      setActiveId(threadId);
      navigate("/app/ask", { replace: true });
      return;
    }

    if (from) {
      navigate("/app/ask", { replace: true });
      const { label, context } = pageContextFor(from);
      if (!context) return;
      const t = create({ title: "New chat", planTitle: label, planContext: context });
      setActiveId(t.id);
      return;
    }

    const t = create({
      title: q ? titleFrom(q) : "New chat",
      planTitle: plan,
      planContext: plan ? `Plan: ${plan}` : undefined,
    });
    setActiveId(t.id);
    navigate("/app/ask", { replace: true });
    if (q) void send(q, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.messages.length, streamText, streaming, planDraft, planCreated]);

  async function send(text: string, thread?: Thread) {
    const t = thread ?? active;
    if (!text.trim() || streaming || !t) return;
    setInput("");
    setStreaming(true);
    setStreamText("");
    try {
      await runTurn(t, text, update, setStreamText);
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  }

  function startNew() {
    setActiveId(null);
    setInput("");
  }
  function submitGlobal(text: string) {
    const t = create({ title: titleFrom(text) });
    setActiveId(t.id);
    void send(text, t);
  }

  return (
    <div className="frame">
      <div className="ask-shell">
        {/* Thread rail */}
        <aside className="ask-rail">
          <button className="btn ask-new" onClick={startNew}><PlusIcon /> New chat</button>
          <div className="ask-list">
            {threads.length === 0 && <div className="ask-empty">No chats yet.</div>}
            {threads.map((t) => (
              <div key={t.id} className={`ask-item ${t.id === activeId ? "on" : ""}`} onClick={() => setActiveId(t.id)}>
                <div className="ask-item-main">
                  <div className="ask-item-t">{t.title}</div>
                  {t.planTitle && <div className="ask-item-p">◆ {t.planTitle}</div>}
                </div>
                <button className="ask-del" aria-label="Delete chat" onClick={(e) => { e.stopPropagation(); remove(t.id); if (t.id === activeId) setActiveId(null); }}><TrashIcon /></button>
              </div>
            ))}
          </div>
        </aside>

        {/* Conversation */}
        <section className="ask-main">
          {!active ? (
            <div className="ask-welcome">
              <img src="/logo.png" alt="Juniper" className="ask-logo" />
              <h1>Ask Juniper</h1>
              <p className="ask-sub">Your AI financial planner. It sees your linked accounts and gives tailored, plain-English guidance. Ask anything, or start here.</p>
              <div className="ask-starters">
                {STARTERS.map((s) => <button key={s} className="ask-starter" onClick={() => submitGlobal(s)}>{s}</button>)}
              </div>
              <ComposerNew onSend={submitGlobal} />
              <p className="disc" style={{ textAlign: "center", marginTop: 14 }}>Juniper gives educational guidance, not licensed financial, tax, or legal advice.</p>
            </div>
          ) : (
            <>
              <div className="ask-tools">
                {!active.planTitle ? (
                  <span />
                ) : isPageContext(active.planContext) ? (
                  // Page-grounded (the app-bar icon, issue #263), so it's
                  // switchable: "Credit" alone read as a category nobody
                  // picked until it was explained that it just names
                  // whichever page the icon was pressed from.
                  <span className="ask-scope inline">
                    On the{" "}
                    <select
                      className="ask-scope-select"
                      value={active.planTitle}
                      onChange={(e) => {
                        const next = PAGE_CONTEXTS.find((p) => p.label === e.target.value);
                        if (!next) return;
                        update(active.id, (x) => ({ ...x, planTitle: next.label, planContext: next.context, updatedAt: Date.now() }));
                      }}
                    >
                      {PAGE_CONTEXTS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
                    </select>{" "}
                    page
                  </span>
                ) : (
                  // A real plan from the Plans page: fixed, not one of the
                  // switchable page options above.
                  <span className="ask-scope inline">Grounded in your <b>{active.planTitle}</b> plan</span>
                )}
                {active.messages.some((m) => m.role === "assistant") && !streaming && (
                  <span className="ask-tool-actions">
                    {reportErr && <span className="ask-tool-err">Couldn't build the plan. Try again.</span>}
                    {reportBusy ? (
                      <button className="btn sm ghost" disabled>Preparing plan…</button>
                    ) : active.report ? (
                      <>
                        <button className="btn sm ghost" onClick={makeReport}>Update</button>
                        <button className="btn sm" onClick={() => setShowReport(true)}>View plan (PDF)</button>
                      </>
                    ) : (
                      <button className="btn sm" onClick={makeReport}>Save as plan (PDF)</button>
                    )}
                    {/* Only for a generic or page-grounded thread. A thread
                        already scoped to a real plan (active.planTitle set
                        and not one of the switchable page options) has
                        nothing to "become": that plan already exists. */}
                    {(!active.planTitle || isPageContext(active.planContext)) && (
                      <button className="btn sm ghost" disabled={planDraftBusy} onClick={makePlanDraft}>
                        {planDraftBusy ? "Reading…" : "Track this as a plan"}
                      </button>
                    )}
                  </span>
                )}
              </div>
              <div className="ask-thread" ref={scrollRef}>
                {active.messages.map((m, i) => (
                  <div key={i} className={`ask-turn ${m.role}`}>
                    {m.role === "assistant" && <div className="ask-who">Juniper</div>}
                    <div className="ask-bubble"><Rich text={m.content} /></div>
                  </div>
                ))}
                {streaming && (
                  <div className="ask-turn assistant">
                    <div className="ask-who">Juniper</div>
                    <div className="ask-bubble">{streamText ? <Rich text={streamText} /> : <span className="ask-dots"><i /><i /><i /></span>}</div>
                  </div>
                )}
                {planDraftErr && !planDraft && (
                  <div className="ask-plandraft-done"><span>Couldn't read a plan out of that conversation. Try again.</span></div>
                )}
                {planDraft && <PlanDraftCard draft={planDraft} busy={planDraftBusy} err={planDraftErr} onCreate={createFromDraft} onAdjust={adjustDraft} />}
                {planCreated && (
                  <div className="ask-plandraft-done">
                    <span><b>{planCreated.title}</b> is now a plan.</span>
                    <button className="view-link" onClick={() => navigate(`/app/plans?open=${encodeURIComponent(planCreated.domain)}`)}>View it</button>
                  </div>
                )}
              </div>
              <Composer disabled={streaming} onSend={(v) => send(v)} value={input} setValue={setInput} />
            </>
          )}
        </section>
      </div>

      {showReport && active?.report && (
        <PlanReportView report={active.report} planTitle={active.planTitle} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

// Field labels for the draft preview. Deliberately its own small table rather
// than importing Plans' SHAPE_COPY: this is a transient preview of what would
// be created, not the plan card itself, and the two are allowed to word
// things slightly differently without drifting into two sources of truth
// about a real plan's fields (goalFrom in pages/app/plans.tsx is still the
// only thing that ever writes a plan's `goal` object).
const DRAFT_LABEL: Record<PlanDraftFromChat["shape"], { target: string; current: string; monthly: string }> = {
  save: { target: "Target", current: "Saved so far", monthly: "Monthly" },
  buy: { target: "Down payment needed", current: "Set aside so far", monthly: "Monthly" },
  payoff: { target: "Balance to clear", current: "Paid off so far", monthly: "Monthly" },
  income: { target: "Target income", current: "Current income", monthly: "" },
};
const SHAPE_NAME: Record<PlanDraftFromChat["shape"], string> = {
  save: "Saving up", buy: "Buying", payoff: "Paying off", income: "Growing income",
};

function PlanDraftCard({ draft, busy, err, onCreate, onAdjust }: {
  draft: PlanDraftFromChat;
  busy: boolean;
  err: boolean;
  onCreate: () => void;
  onAdjust: () => void;
}) {
  const labels = DRAFT_LABEL[draft.shape];
  const rows: Array<[string, string]> = [];
  if (draft.found.includes("target_value") && draft.target_value != null) rows.push([labels.target, money(draft.target_value)]);
  if (draft.found.includes("current_value") && draft.current_value != null) rows.push([labels.current, money(draft.current_value)]);
  if (labels.monthly && draft.found.includes("monthly_contribution") && draft.monthly_contribution != null) rows.push([labels.monthly, `${money(draft.monthly_contribution)}/mo`]);
  if (draft.shape === "payoff" && draft.found.includes("rate") && draft.rate != null) rows.push(["Rate", `${draft.rate.toFixed(1)}%/yr`]);
  if (draft.found.includes("target_date") && draft.target_date) rows.push(["Target date", draft.target_date]);

  return (
    <div className="ask-plandraft">
      <div className="ask-plandraft-t">{draft.name} · {SHAPE_NAME[draft.shape]}</div>
      {rows.length ? (
        rows.map(([k, v]) => (
          <div className="ask-plandraft-row" key={k}><span>{k}</span><b>{v}</b></div>
        ))
      ) : (
        <div className="ask-plandraft-sub">Nothing concrete came up in this conversation yet, so it would start blank and Juniper would ask for a target once it exists.</div>
      )}
      {err && <div className="ask-tool-err" style={{ marginBottom: 6 }}>That didn't save. Check your connection and try again.</div>}
      <div className="ask-plandraft-actions">
        {/* Nothing to confirm with no figures found: offering "looks right"
            over an empty card would ask the member to accept a plan that
            has nothing in it yet. The form is where a plan with no target
            belongs (it lands in Setup there, same as any other), not a
            one-tap accept here. */}
        {rows.length > 0 && (
          <button className="btn sm" disabled={busy} onClick={onCreate}>{busy ? "Creating…" : "Looks right, create it"}</button>
        )}
        <button className="btn sm ghost" disabled={busy} onClick={onAdjust}>{rows.length > 0 ? "Adjust first" : "Set it up"}</button>
      </div>
    </div>
  );
}

function Composer({ value, setValue, onSend, disabled }: { value: string; setValue: (v: string) => void; onSend: (v: string) => void; disabled: boolean }) {
  return (
    <form className="ask-composer" onSubmit={(e) => { e.preventDefault(); const v = value.trim(); if (v && !disabled) onSend(v); }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={disabled ? "Juniper is thinking…" : "Reply to Juniper…"} disabled={disabled} />
      <button className="btn" type="submit" disabled={disabled || !value.trim()}>Send</button>
    </form>
  );
}

// The welcome-screen composer keeps its own input so the rail's state stays clean.
function ComposerNew({ onSend }: { onSend: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="ask-composer lg" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t) { setV(""); onSend(t); } }}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Ask Juniper anything about your money…" />
      <button className="btn" type="submit" disabled={!v.trim()}>Ask</button>
    </form>
  );
}
