import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useThreads, streamTurn, titleFrom, type Thread } from "@/lib/planner";

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

// Very light **bold** + paragraph rendering — enough for planner replies.
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const search = useSearch();
  const [, navigate] = useLocation();
  const seeded = useRef(false);

  const active: Thread | undefined = threads.find((t) => t.id === activeId);

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
    const isFirst = t.messages.length === 0;
    const nextMsgs = [...t.messages, { role: "user" as const, content: text }];
    update(t.id, (x) => ({ ...x, messages: nextMsgs, title: isFirst ? titleFrom(text) : x.title, updatedAt: Date.now() }));
    setInput("");
    setStreaming(true);
    setStreamText("");
    try {
      const full = await streamTurn(nextMsgs, t.planContext, setStreamText);
      update(t.id, (x) => ({ ...x, messages: [...nextMsgs, { role: "assistant", content: full }], updatedAt: Date.now() }));
    } catch {
      update(t.id, (x) => ({ ...x, messages: [...nextMsgs, { role: "assistant", content: "Sorry, something went wrong. Please try again." }], updatedAt: Date.now() }));
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
              <div className="ask-thread" ref={scrollRef}>
                {active.planTitle && <div className="ask-scope">Grounded in your <b>{active.planTitle}</b> plan</div>}
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
