import { useState } from "react";
import { money2 } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { activity as mockActivity, you, partner as demoPartner, type ActivityItem } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";
import { useActivity, sendMessage, reactTo, type PartnerMessage } from "@/lib/partner";

const PALETTE = ["👍", "❤️", "😂", "🎉"];

// ── Live chat (real partnership) ─────────────────────────────────────────────
function LiveActivity({ messages, reactions, refresh, partnerName }: {
  messages: PartnerMessage[]; reactions: { target: string; emoji: string; count: number; byMe: boolean }[]; refresh: () => void; partnerName: string;
}) {
  const [text, setText] = useState("");
  const send = async () => { const t = text.trim(); if (!t) return; setText(""); await sendMessage(t); refresh(); };
  const react = async (target: string, emoji: string) => { await reactTo(target, emoji); refresh(); };

  return (
    <div className="card">
      <div className="card-head"><h3>Shared chat</h3><span className="muted" style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)" }}>👍 or ask, together</span></div>
      <div className="thread" style={{ borderTop: 0, background: "transparent", padding: 0, gap: 12 }}>
        {messages.length === 0 && <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>No messages yet — say hi to {partnerName}.</div>}
        {messages.map((m) => {
          const rx = reactions.filter((r) => r.target === m.id);
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.who === "you" ? "flex-end" : "flex-start", gap: 4 }}>
              {m.txnMerchant && <span style={{ fontSize: 10.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>re: {m.txnMerchant}</span>}
              <div className={`msg ${m.who === "you" ? "me" : "them"}`} style={{ width: "100%" }}><div className="bubble">{m.body}</div></div>
              <div className="reactions" style={{ padding: 0, background: "transparent" }}>
                {PALETTE.map((e) => {
                  const hit = rx.find((r) => r.emoji === e);
                  return <button key={e} className={`react ${hit?.byMe ? "on" : ""}`} onClick={() => react(m.id, e)}>{e}{hit ? ` ${hit.count}` : ""}</button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chatbar" style={{ borderTop: "1px solid var(--jnpr-line-2)", marginTop: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={`Message ${partnerName}…`} />
        <button className="btn sm" onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ── Demo feed (mock) ─────────────────────────────────────────────────────────
function DemoActivity({ pname }: { pname: string }) {
  const whoName = (w: "you" | "partner" | "shared") => (w === "you" ? you.name : w === "partner" ? pname : "Both");
  return (
    <div className="card">
      {mockActivity.map((it: ActivityItem, i: number) => {
        if (it.kind === "txn") {
          return (
            <div className="txchat" key={i}>
              <div className="tx">
                <div className="tile sm" style={{ background: cssVar(it.who === "you" ? you.k : demoPartner.k) }}>{it.merchant.charAt(0)}</div>
                <div style={{ flex: 1 }}><div className="nm">{it.merchant}</div><div className="mt">{whoName(it.who)} · {it.cat}</div></div>
                <div className="tnum" style={{ fontWeight: 700 }}>{money2(-it.amount)}</div>
              </div>
              <div className="reactions"><span className={`react ${it.reacted ? "on" : ""}`}>👍 {it.reacted ? "You" : ""}</span><span className="react">❤️</span><span className="react">😂</span><span className="react">＋</span></div>
              {it.thread && <div className="thread">{it.thread.map((m, j) => <div className={`msg ${m.who === "you" ? "me" : "them"}`} key={j}><div className="bubble">{m.text}</div></div>)}</div>}
              <div className="chatbar"><input placeholder={`Message ${pname}…`} /><button className="btn sm">Send</button></div>
            </div>
          );
        }
        if (it.kind === "msg") return <div className="feed-item" key={i}><div className="feed-ic" style={{ background: "var(--jnpr-accent-soft)" }}>💬</div><div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{whoName(it.who)}</b><div className="msg them" style={{ marginTop: 5 }}><div className="bubble">{it.text}</div></div></div></div>;
        if (it.kind === "goal") return <div className="feed-item" key={i}><div className="feed-ic" style={{ background: "var(--jnpr-good-soft)" }}>{it.icon}</div><div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{it.title}</b><div className="mt">{it.meta}</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${it.pct}%`, background: cssVar(it.k) }} /></div></div></div>;
        return <div className="feed-item" key={i}><div className="feed-ic" style={{ background: "var(--jnpr-warn-soft)" }}>{it.icon}</div><div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{it.title}</b><div className="mt">{it.meta}</div>{it.cta && <button className="btn ghost sm" style={{ marginTop: 6 }}>{it.cta}</button>}</div></div>;
      })}
    </div>
  );
}

export function SharedActivity() {
  const { partner } = useWorkspace();
  const { data, refresh } = useActivity();
  const pname = partner.name || demoPartner.name;
  return (
    <SharedPage title="Activity" sub="Shared moments — bills, contributions, and a 👍 or a question on any transaction.">
      {data
        ? <LiveActivity messages={data.messages} reactions={data.reactions} refresh={refresh} partnerName={pname} />
        : <DemoActivity pname={pname} />}
    </SharedPage>
  );
}
