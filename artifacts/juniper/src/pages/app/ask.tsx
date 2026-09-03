import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useThreads, runTurn, titleFrom, generateReport, type Thread } from "@/lib/planner";
import { PlanReportView } from "@/components/juniper/plan-report";
import { Rich } from "@/components/juniper/ask-rich";

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

export default function Ask() {
  const { threads, create, remove, update } = useThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const search = useSearch();
  const [, navigate] = useLocation();
  const seeded = useRef(false);

  const active: Thread | undefined = threads.find((t) => t.id === activeId);

  // Reset the report overlay when switching threads.
  useEffect(() => { setShowReport(false); setReportErr(false); }, [activeId]);

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

  // Deep links from a plan:
  //   ?thread=<id>        → open an existing chat
  //   ?q=…&plan=…         → new plan-scoped chat, auto-ask the question
  //   ?plan=…             → new, empty plan-scoped chat, ready to type
  useEffect(() => {
    if (seeded.current) return;
    const params = new URLSearchParams(search);
    const threadId = params.get("thread");
    const q = params.get("q");
    const plan = params.get("plan") || undefined;
    if (!threadId && !q && !plan) return;
    seeded.current = true;

    if (threadId) {
      setActiveId(threadId);
      navigate("/app/ask", { replace: true });
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
  }, [active?.messages.length, streamText, streaming]);

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
                {active.planTitle
                  ? <span className="ask-scope inline">Grounded in your <b>{active.planTitle}</b> plan</span>
                  : <span />}
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
