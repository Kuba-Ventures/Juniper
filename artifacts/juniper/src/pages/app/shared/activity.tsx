import { money2 } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { SharedPage } from "@/components/juniper/shared-frame";
import { activity, you, partner as demoPartner, type ActivityItem } from "@/lib/shared-data";
import { useWorkspace } from "@/lib/workspace";

export function SharedActivity() {
  const { partner } = useWorkspace();
  const pname = partner.name || demoPartner.name;
  const whoName = (w: "you" | "partner" | "shared") => (w === "you" ? you.name : w === "partner" ? pname : "Both");

  const renderItem = (it: ActivityItem, i: number) => {
    if (it.kind === "txn") {
      return (
        <div className="txchat" key={i}>
          <div className="tx">
            <div className="tile sm" style={{ background: cssVar(it.who === "you" ? you.k : demoPartner.k) }}>{it.merchant.charAt(0)}</div>
            <div style={{ flex: 1 }}><div className="nm">{it.merchant}</div><div className="mt">{whoName(it.who)} · {it.cat}</div></div>
            <div className="tnum" style={{ fontWeight: 700 }}>{money2(-it.amount)}</div>
          </div>
          <div className="reactions">
            <span className={`react ${it.reacted ? "on" : ""}`}>👍 {it.reacted ? "You" : ""}</span>
            <span className="react">❤️</span><span className="react">😂</span><span className="react">＋</span>
          </div>
          {it.thread && (
            <div className="thread">
              {it.thread.map((m, j) => (
                <div className={`msg ${m.who === "you" ? "me" : "them"}`} key={j}><div className="bubble">{m.text}</div></div>
              ))}
            </div>
          )}
          <div className="chatbar"><input placeholder={`Message ${pname}…`} /><button className="btn sm">Send</button></div>
        </div>
      );
    }
    if (it.kind === "msg") {
      return (
        <div className="feed-item" key={i}>
          <div className="feed-ic" style={{ background: "var(--jnpr-accent-soft)" }}>💬</div>
          <div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{whoName(it.who)}</b><div className="msg them" style={{ marginTop: 5 }}><div className="bubble">{it.text}</div></div></div>
        </div>
      );
    }
    if (it.kind === "goal") {
      return (
        <div className="feed-item" key={i}>
          <div className="feed-ic" style={{ background: "var(--jnpr-good-soft)" }}>{it.icon}</div>
          <div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{it.title}</b><div className="mt">{it.meta}</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${it.pct}%`, background: cssVar(it.k) }} /></div></div>
        </div>
      );
    }
    // bill
    return (
      <div className="feed-item" key={i}>
        <div className="feed-ic" style={{ background: "var(--jnpr-warn-soft)" }}>{it.icon}</div>
        <div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{it.title}</b><div className="mt">{it.meta}</div>{it.cta && <button className="btn ghost sm" style={{ marginTop: 6 }}>{it.cta}</button>}</div>
      </div>
    );
  };

  return (
    <SharedPage title="Activity" sub="Shared moments — bills, contributions, and a 👍 or a question on any transaction.">
      <div className="card">
        {activity.map(renderItem)}
      </div>
    </SharedPage>
  );
}
