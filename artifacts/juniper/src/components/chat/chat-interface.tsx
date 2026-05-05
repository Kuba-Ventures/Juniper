import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, ClipboardList } from "lucide-react";
import { Artifact } from "@/components/app-sidebar";
import { ProfileQuestionnaire } from "./profile-questionnaire";
import { UserProfile, loadProfile, formatProfileContext } from "@/lib/profile";

// ── Design tokens ──────────────────────────────────────────────────────────
const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

// ── Types ──────────────────────────────────────────────────────────────────
type ApiMessage = { role: "user" | "assistant"; content: string };

type DisplayMessage = {
  id: string;
  role: "user" | "juniper";
  content: string;
  isError?: boolean;
  isStreaming?: boolean;
};

// ── Starter chips ──────────────────────────────────────────────────────────
const CHIPS: Array<{ heading: string; sub: string; firstMessage: string }> = [
  {
    heading: "Help us understand our finances together",
    sub: "A guided conversation to map out where you both stand today.",
    firstMessage:
      "We'd like to start fresh and get a clear picture of our household finances together. Can you help guide us through this?",
  },
  {
    heading: "We're thinking about buying a home",
    sub: "Model what's affordable based on your income, debt, and savings.",
    firstMessage:
      "We're seriously thinking about buying a home and want to figure out if we're financially ready and what we could realistically afford.",
  },
  {
    heading: "We want to tackle our debt",
    sub: "Build a payoff plan that works for both of you.",
    firstMessage:
      "We have some debt we want to pay off and need help coming up with the best strategy for our situation.",
  },
  {
    heading: "We're planning our next chapter",
    sub: "Think through marriage, a baby, or a big move with confidence.",
    firstMessage:
      "We're heading into a big life change and want to make sure our finances are solid going into it. Can you help us think it through?",
  },
];

// ── J logo mark ────────────────────────────────────────────────────────────
function JLogo({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: sage,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: serif,
          fontSize: size * 0.54,
          color: "#fff",
          fontStyle: "italic",
          lineHeight: 1,
        }}
      >
        J
      </span>
    </div>
  );
}

// ── Simple text renderer (handles newlines + **bold**) ─────────────────────
function MessageText({ text, isError }: { text: string; isError?: boolean }) {
  const color = isError ? "#b94040" : ink;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span style={{ color, whiteSpace: "pre-wrap" }}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </span>
  );
}

// ── Typing dots ────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: sage,
            animation: "bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────
type Props = {
  userName: string;
  onConversationStart: (title: string) => void;
  onArtifactSaved: (artifact: Artifact) => void;
};

// ── ChatInterface ──────────────────────────────────────────────────────────
export function ChatInterface({ userName, onConversationStart }: Props) {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(() => loadProfile());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, isStreaming]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // Register conversation start
      if (!conversationStarted) {
        const title =
          content.length > 52 ? content.slice(0, 52) + "..." : content;
        onConversationStart(title);
        setConversationStarted(true);
      }

      const userMsg: ApiMessage = { role: "user", content };
      const newApiMessages = [...apiMessages, userMsg];
      setApiMessages(newApiMessages);

      const userId = `${Date.now()}-user`;
      const assistantId = `${Date.now()}-assistant`;

      setDisplayMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content },
        { id: assistantId, role: "juniper", content: "", isStreaming: true },
      ]);
      setIsStreaming(true);
      setShowWelcome(false);

      let fullText = "";

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newApiMessages,
            hasPartner: false,
            profileContext: profile ? formatProfileContext(profile) : "",
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
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
                setDisplayMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullText }
                      : m,
                  ),
                );
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }

        setApiMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullText },
        ]);
      } catch {
        setDisplayMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Sorry, something went wrong. Please check your connection and try again.",
                  isError: true,
                  isStreaming: false,
                }
              : m,
          ),
        );
      } finally {
        setDisplayMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
        setIsStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [apiMessages, conversationStarted, isStreaming, onConversationStart],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const val = inputValue.trim();
      if (!val) return;
      setInputValue("");
      sendMessage(val);
    },
    [inputValue, sendMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Welcome screen ─────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <>
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px 32px",
            maxWidth: 760,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <img src="/logo.png" alt="Juniper" style={{ width: 72, height: 72, objectFit: "contain" }} />
          <h1
            style={{
              fontFamily: serif,
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 400,
              color: ink,
              margin: "24px 0 14px",
              letterSpacing: "-0.02em",
              textAlign: "center",
            }}
          >
            Welcome, {userName}.
          </h1>
          <p
            style={{
              fontSize: 17,
              color: muted,
              lineHeight: 1.65,
              maxWidth: 480,
              textAlign: "center",
              margin: "0 0 20px",
            }}
          >
            I'm here to help you plan with clarity. Ask me anything, or pick a
            place to start.
          </p>

          {/* Profile CTA */}
          <button
            onClick={() => setShowQuestionnaire(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "none", border: `1.5px solid ${border}`,
              borderRadius: 100, padding: "8px 18px", marginBottom: 36,
              fontFamily: sans, fontSize: 13, color: profile ? sage : muted,
              cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
              fontWeight: profile ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = sage;
              e.currentTarget.style.color = sage;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = border;
              e.currentTarget.style.color = profile ? sage : muted;
            }}
          >
            <ClipboardList size={13} />
            {profile ? "Profile complete · edit answers" : "Set up your financial profile"}
          </button>

          {/* Starter chips */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              width: "100%",
              marginBottom: 36,
            }}
          >
            {CHIPS.map((chip) => (
              <button
                key={chip.heading}
                onClick={() => sendMessage(chip.firstMessage)}
                style={{
                  background: cream,
                  border: `1.5px solid rgba(92,122,101,0.3)`,
                  borderRadius: 12,
                  padding: "22px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  fontFamily: sans,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = sage;
                  e.currentTarget.style.boxShadow =
                    "0 2px 10px rgba(92,122,101,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(92,122,101,0.3)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <p
                  style={{
                    fontFamily: serif,
                    fontSize: 15,
                    color: ink,
                    margin: "0 0 6px",
                    lineHeight: 1.3,
                    fontWeight: 400,
                  }}
                >
                  {chip.heading}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: muted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {chip.sub}
                </p>
              </button>
            ))}
          </div>

          {/* Chat input */}
          <div style={{ width: "100%", maxWidth: 680 }}>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  position: "relative",
                  background: cream,
                  border: `1.5px solid ${sage}`,
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Ask Juniper anything about your financial life..."
                  rows={3}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    padding: "16px 56px 16px 18px",
                    fontFamily: sans,
                    fontSize: 16,
                    color: ink,
                    resize: "none",
                    outline: "none",
                    lineHeight: 1.55,
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  aria-label="Send message"
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 12,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: inputValue.trim()
                      ? sage
                      : "rgba(92,122,101,0.25)",
                    border: "none",
                    cursor: inputValue.trim() ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.15s",
                  }}
                >
                  <ArrowUp size={18} color="#fff" strokeWidth={2.5} />
                </button>
              </div>
            </form>
            <p
              style={{
                fontSize: 12,
                color: muted,
                textAlign: "center",
                margin: "10px 0 0",
              }}
            >
              Juniper is a thinking partner, not a financial advisor.
            </p>
          </div>
        </div>
      </div>

      {showQuestionnaire && (
        <ProfileQuestionnaire
          initialData={profile ?? undefined}
          onClose={() => setShowQuestionnaire(false)}
          onSave={(p) => { setProfile(p); setShowQuestionnaire(false); }}
        />
      )}
      </>
    );
  }

  // ── Active conversation ────────────────────────────────────────────────
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "32px 24px 160px" }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {displayMessages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role === "juniper" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <JLogo size={24} />
                  <span
                    style={{
                      fontSize: 12,
                      color: muted,
                      fontWeight: 500,
                      letterSpacing: "0.01em",
                    }}
                  >
                    Juniper
                  </span>
                </div>
              )}

              <div
                style={{
                  maxWidth: msg.role === "user" ? "80%" : "100%",
                  background:
                    msg.role === "user"
                      ? "rgba(92,122,101,0.13)"
                      : "transparent",
                  borderRadius:
                    msg.role === "user" ? "16px 16px 4px 16px" : 0,
                  padding: msg.role === "user" ? "12px 16px" : 0,
                  fontSize: 16,
                  lineHeight: 1.65,
                  fontFamily: sans,
                }}
              >
                {msg.isStreaming && msg.content === "" ? (
                  <TypingDots />
                ) : (
                  <MessageText text={msg.content} isError={msg.isError} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: `linear-gradient(to top, ${cream} 72%, transparent)`,
          padding: "32px 24px 24px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <form onSubmit={handleSubmit}>
            <div
              style={{
                position: "relative",
                background: cream,
                border: `1.5px solid ${isStreaming ? border : sage}`,
                borderRadius: 14,
                transition: "border-color 0.2s",
              }}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isStreaming ? "Juniper is thinking..." : "Reply to Juniper..."
                }
                disabled={isStreaming}
                rows={1}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  padding: "14px 52px 14px 18px",
                  fontFamily: sans,
                  fontSize: 16,
                  color: ink,
                  resize: "none",
                  outline: "none",
                  lineHeight: 1.5,
                  boxSizing: "border-box",
                  opacity: isStreaming ? 0.5 : 1,
                }}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming}
                aria-label="Send"
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background:
                    inputValue.trim() && !isStreaming
                      ? sage
                      : "rgba(92,122,101,0.25)",
                  border: "none",
                  cursor:
                    inputValue.trim() && !isStreaming ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >
                <ArrowUp size={16} color="#fff" strokeWidth={2.5} />
              </button>
            </div>
          </form>
          <p
            style={{
              fontSize: 12,
              color: muted,
              textAlign: "center",
              margin: "8px 0 0",
            }}
          >
            Juniper is a thinking partner, not a financial advisor.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
