// The shared thread: messages between the two of you, with reactions.
//
// Live data only, as of Stage 4f. The demo feed this used to fall back to was
// the seeded household's conversation, complete with invented transactions and
// a chat box that sent nothing, shown to any couple whose own thread was empty.
// A partnership with nothing said yet now says so.
//
// The partner's name comes from the partnership, never from a constant.
import { useState } from "react";
import { SharedPage } from "@/components/juniper/shared-frame";
import { useWorkspace } from "@/lib/workspace";
import { useActivity, sendMessage, reactTo, type PartnerMessage } from "@/lib/partner";

const PALETTE = ["👍", "❤️", "😂", "🎉"];

function Thread({ messages, reactions, onChanged, partnerName }: {
  messages: PartnerMessage[];
  reactions: { target: string; emoji: string; count: number; byMe: boolean }[];
  onChanged: () => void;
  partnerName: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    await sendMessage(t);
    onChanged();
    setBusy(false);
  };
  const react = async (target: string, emoji: string) => { await reactTo(target, emoji); onChanged(); };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Shared chat</h3>
        <span style={{ fontSize: 11.5, color: "var(--jnpr-ink-3)" }}>Only the two of you can see this</span>
      </div>
      <div className="thread" style={{ borderTop: 0, background: "transparent", padding: 0, gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
            No messages yet, say hi to {partnerName}.
          </div>
        )}
        {messages.map((m) => {
          const rx = reactions.filter((r) => r.target === m.id);
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.who === "you" ? "flex-end" : "flex-start", gap: 4 }}>
              {m.txnMerchant && <span style={{ fontSize: 10.5, color: "var(--jnpr-ink-3)", fontWeight: 600 }}>re: {m.txnMerchant}</span>}
              <div className={`msg ${m.who === "you" ? "me" : "them"}`} style={{ width: "100%" }}><div className="bubble">{m.body}</div></div>
              <div className="reactions" style={{ padding: 0, background: "transparent" }}>
                {PALETTE.map((e) => {
                  const hit = rx.find((r) => r.emoji === e);
                  return (
                    <button key={e} className={`react ${hit?.byMe ? "on" : ""}`} onClick={() => react(m.id, e)}
                      aria-label={`React ${e}`} aria-pressed={!!hit?.byMe}>
                      {e}{hit ? ` ${hit.count}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chatbar" style={{ borderTop: "1px solid var(--jnpr-line-2)", marginTop: 12 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message ${partnerName}…`}
          aria-label={`Message ${partnerName}`}
        />
        <button className="btn sm" onClick={send} disabled={busy || !text.trim()}>Send</button>
      </div>
    </div>
  );
}

export function SharedActivity() {
  const { partner, refresh: refreshWorkspace } = useWorkspace();
  const { data, loading, refresh } = useActivity();
  const pname = partner.name || "your partner";

  // The workspace refresh is what grows the Activity tab in the app bar off the
  // first message, so the surface that creates the thing also announces it.
  const onChanged = () => { refresh(); refreshWorkspace(); };

  return (
    <SharedPage title="Activity" sub="Messages between the two of you, and a reaction on any of them.">
      {loading && !data ? (
        <div className="card" style={{ padding: "18px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, textAlign: "center" }}>
          Loading your shared thread…
        </div>
      ) : (
        <Thread
          messages={data?.messages ?? []}
          reactions={data?.reactions ?? []}
          onChanged={onChanged}
          partnerName={pname}
        />
      )}
    </SharedPage>
  );
}
