import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { getAccessToken } from "@/lib/supabase";
import { savePlan, type Plan, type PlanChatTurn } from "@/lib/plans";
import { trackEngagement } from "@/lib/analytics";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type ApiMessage = { role: "user" | "assistant"; content: string };

function stripEmDashes(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/\s+--\s+/g, ", ");
}

type Props = {
  plan: Plan;
  // When autoAskNonce increments, auto-send autoAsk (used by next-action
  // "How?" buttons to ask Juniper to walk through a step).
  autoAsk?: string;
  autoAskNonce?: number;
};

export function PlanChat({ plan, autoAsk, autoAskNonce }: Props) {
  const [messages, setMessages] = useState<ApiMessage[]>(() =>
    (plan.plan_chat_history ?? []).map((t) => ({ role: t.role, content: t.content })),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errored, setErrored] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  // Auto-ask when a next-action "How?" button fires (nonce changes).
  useEffect(() => {
    if (autoAsk && autoAskNonce && autoAskNonce > 0) void sendTurn(autoAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAskNonce]);

  const planRef = useRef(plan);
  planRef.current = plan;

  const messagesRef = useRef<ApiMessage[]>(messages);
  messagesRef.current = messages;

  async function sendTurn(rawText: string) {
    if (streaming || !rawText.trim()) return;
    // Sending a plan-chat message is a meaningful (WAU) action.
    trackEngagement("plan_chat_message", { plan_domain: planRef.current.domain });
    setStreaming(true);
    setErrored(false);
    setInput("");

    const currentMessages = messagesRef.current;
    const newApi: ApiMessage[] = [...currentMessages, { role: "user", content: rawText }];
    const assistantStart: ApiMessage = { role: "assistant", content: "" };

    setMessages([...newApi, assistantStart]);

    let fullText = "";
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/plan-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          domain: planRef.current.domain,
          messages: newApi,
          plan: {
            domain: planRef.current.domain,
            has_partner: planRef.current.has_partner,
            partner_first_name: planRef.current.partner_first_name,
            goal: planRef.current.goal,
            current_state: planRef.current.current_state,
            kpis: planRef.current.kpis,
            milestones: planRef.current.milestones,
            next_actions: planRef.current.next_actions,
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: stripEmDashes(fullText) };
                return next;
              });
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      setErrored(true);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please check your connection and try again.",
        };
        return next;
      });
      setStreaming(false);
      return;
    }

    setStreaming(false);

    // Persist the full history (user + assistant) to the plan.
    const finalHistory: PlanChatTurn[] = [
      ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: rawText },
      { role: "assistant", content: stripEmDashes(fullText) },
    ];
    void savePlan({
      domain: planRef.current.domain,
      plan_chat_history: finalHistory,
    });
  }

  return (
    <section style={{ marginTop: 36, borderTop: `1px solid ${border}`, paddingTop: 28 }}>
      <h2
        style={{
          fontFamily: serif,
          fontSize: 18,
          fontWeight: 400,
          color: ink,
          margin: "0 0 6px",
        }}
      >
        Ask about this plan
      </h2>
      <p style={{ fontSize: 13, color: muted, margin: "0 0 18px", lineHeight: 1.55 }}>
        Juniper knows your full plan above. Ask anything specific to it.
      </p>

      {messages.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 14,
            paddingBottom: 4,
          }}
        >
          {messages.map((m, i) => (
            <PlanChatBubble key={i} role={m.role} content={m.content} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !streaming) void sendTurn(input.trim());
        }}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: "#fff",
          border: `1px solid ${border}`,
          borderRadius: 14,
          padding: "10px 12px",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && !streaming) void sendTurn(input.trim());
            }
          }}
          placeholder={
            streaming ? "Juniper is thinking…" : "What should I focus on first? How do I get there faster?"
          }
          disabled={streaming}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: sans,
            fontSize: 14.5,
            color: ink,
            padding: "8px 6px",
            lineHeight: 1.5,
            minHeight: 24,
            maxHeight: 160,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          aria-label="Send"
          style={{
            background: sage,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: input.trim() && !streaming ? "pointer" : "default",
            opacity: input.trim() && !streaming ? 1 : 0.4,
            transition: "opacity 0.15s",
            flexShrink: 0,
          }}
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      </form>
      {errored && (
        <p style={{ textAlign: "center", color: "#b94040", fontSize: 12, marginTop: 8 }}>
          Connection error. Try again.
        </p>
      )}
    </section>
  );
}

function PlanChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            background: "rgba(92,122,101,0.10)",
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: "9px 13px",
            maxWidth: "78%",
            fontSize: 14.5,
            color: ink,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <BerryIcon size={18} />
      </div>
      <div
        style={{
          fontSize: 14.5,
          color: ink,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          flex: 1,
          paddingTop: 1,
        }}
      >
        {content || "…"}
      </div>
    </div>
  );
}

function BerryIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="14" r="8" fill="#4A5EC8" />
      <ellipse cx="7" cy="11" rx="2.8" ry="1.6" fill="rgba(255,255,255,0.32)" transform="rotate(-30 7 11)" />
      <path
        d="M10 4.5 L10.9 7.2 L13.6 6.2 L11.7 8.8 L14.2 10.4 L11.2 10.1 L11 13 L10 10.8 L9 13 L8.8 10.1 L5.8 10.4 L8.3 8.8 L6.4 6.2 L9.1 7.2 Z"
        fill="#D4922A"
      />
    </svg>
  );
}
