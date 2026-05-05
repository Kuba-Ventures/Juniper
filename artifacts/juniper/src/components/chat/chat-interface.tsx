import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Bookmark, BookmarkCheck } from "lucide-react";
import { Artifact } from "@/components/app-sidebar";
import { UserProfile, formatProfileContext } from "@/lib/profile";
import { InlineChart, parseSegments, ChartSpec } from "@/components/chat/inline-chart";

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

// ── Juniper berry SVG (shown while streaming) ─────────────────────────────
function JuniperBerry({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Berry body — vivid indigo-blue */}
      <circle cx="10" cy="14" r="8" fill="#4A5EC8"/>
      {/* Deep shadow at bottom */}
      <circle cx="10" cy="14" r="8" fill="url(#berryShade)"/>
      {/* Waxy bloom highlight */}
      <ellipse cx="7" cy="11" rx="2.8" ry="1.6" fill="rgba(255,255,255,0.32)" transform="rotate(-30 7 11)"/>
      {/* Calyx — 4-pointed star cap */}
      <path d="M10 4.5 L10.9 7.2 L13.6 6.2 L11.7 8.8 L14.2 10.4 L11.2 10.1 L11 13 L10 10.8 L9 13 L8.8 10.1 L5.8 10.4 L8.3 8.8 L6.4 6.2 L9.1 7.2 Z" fill="#D4922A"/>
      <defs>
        <radialGradient id="berryShade" cx="60%" cy="65%" r="55%">
          <stop offset="0%" stopColor="transparent"/>
          <stop offset="100%" stopColor="rgba(20,18,60,0.28)"/>
        </radialGradient>
      </defs>
    </svg>
  );
}

// ── J logo mark ────────────────────────────────────────────────────────────
function JLogo({ size = 24, streaming = false }: { size?: number; streaming?: boolean }) {
  const berrySize = size * 1.66 * 0.8; // 1/5 smaller
  return (
    <div
      style={{
        width: berrySize,
        height: berrySize,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: streaming ? "berryPulse 1.6s ease-in-out infinite" : "none",
      }}
    >
      <JuniperBerry size={berrySize} />
    </div>
  );
}

// ── Inline text renderer (handles **bold**) ───────────────────────────────
function RichText({ text, isError }: { text: string; isError?: boolean }) {
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

// ── Message renderer (text + optional inline charts) ──────────────────────
function MessageText({ text, isError, onSaveChart, savedChartTitles }: {
  text: string;
  isError?: boolean;
  onSaveChart?: (spec: ChartSpec) => void;
  savedChartTitles?: Set<string>;
}) {
  const segments = parseSegments(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <RichText key={i} text={seg.content} isError={isError} />;
        if (seg.kind === "chart") return (
          <InlineChart
            key={i}
            spec={seg.spec}
            onSave={onSaveChart ? () => onSaveChart(seg.spec) : undefined}
            saved={savedChartTitles?.has(seg.spec.title)}
          />
        );
        return (
          <span key={i} style={{ display: "inline-block", color: muted, fontSize: 13, fontStyle: "italic" }}>
            Generating chart…
          </span>
        );
      })}
    </>
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
  profile: UserProfile | null;
  onConversationStart: (title: string) => void;
  onArtifactSaved: (artifact: Artifact) => void;
  initialMessages?: ApiMessage[];
  onMessagesUpdate?: (messages: ApiMessage[]) => void;
};

// ── ChatInterface ──────────────────────────────────────────────────────────
export function ChatInterface({ userName, profile, onConversationStart, onArtifactSaved, initialMessages, onMessagesUpdate }: Props) {
  const hasInitial = !!initialMessages?.length;
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    hasInitial
      ? initialMessages!.map((m, i) => ({
          id: `init-${i}`,
          role: (m.role === "user" ? "user" : "juniper") as "user" | "juniper",
          content: m.content,
        }))
      : []
  );
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>(initialMessages ?? []);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(hasInitial);
  const [showWelcome, setShowWelcome] = useState(!hasInitial);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [savedMsgIds, setSavedMsgIds] = useState<Set<string>>(new Set());
  const [savedChartTitles, setSavedChartTitles] = useState<Set<string>>(new Set());

  const handleSaveChart = useCallback((spec: ChartSpec) => {
    const artifact: Artifact = {
      id: `chart-${Date.now()}`,
      type: "chart",
      title: spec.title,
      savedAt: new Date(),
      content: JSON.stringify(spec),
    };
    onArtifactSaved(artifact);
    setSavedChartTitles((prev) => new Set(prev).add(spec.title));
  }, [onArtifactSaved]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSaveToMyPlan = useCallback((msg: DisplayMessage) => {
    const hasChart = msg.content.includes("[CHART:");
    const textOnly = msg.content.replace(/\[CHART:[\s\S]*?\]/g, "").trim();
    const firstLine = textOnly.split("\n")[0].trim() || msg.content.slice(0, 61);
    const title = firstLine.length > 64 ? firstLine.slice(0, 61) + "…" : firstLine;
    const artifact: Artifact = {
      id: msg.id,
      type: hasChart ? "chart" : "scenario",
      title,
      savedAt: new Date(),
      content: msg.content,
    };
    onArtifactSaved(artifact);
    setSavedMsgIds((prev) => new Set(prev).add(msg.id));
  }, [onArtifactSaved]);

  // Always-current ref so sendMessage never captures a stale onMessagesUpdate
  const onMessagesUpdateRef = useRef(onMessagesUpdate);
  onMessagesUpdateRef.current = onMessagesUpdate;

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

        const completedMessages: ApiMessage[] = [
          ...newApiMessages,
          { role: "assistant", content: fullText },
        ];
        setApiMessages(completedMessages);
        onMessagesUpdateRef.current?.(completedMessages);
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
              margin: "0 0 44px",
            }}
          >
            I'm here to help you plan with clarity. Ask me anything, or pick a
            place to start.
          </p>

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
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
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
                  <JLogo size={24} streaming={msg.isStreaming} />
                  <span
                    style={{
                      fontSize: 12,
                      color: ink,
                      fontWeight: 700,
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
                  <MessageText
                    text={msg.content}
                    isError={msg.isError}
                    onSaveChart={msg.role === "juniper" ? handleSaveChart : undefined}
                    savedChartTitles={savedChartTitles}
                  />
                )}
              </div>

              {/* Save to My Plan button */}
              {msg.role === "juniper" && !msg.isStreaming && msg.content && (
                <button
                  onClick={() => handleSaveToMyPlan(msg)}
                  aria-label="Save to My Plan"
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "none",
                    border: `1px solid ${savedMsgIds.has(msg.id) ? sage : border}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 12,
                    color: savedMsgIds.has(msg.id) ? sage : muted,
                    cursor: savedMsgIds.has(msg.id) ? "default" : "pointer",
                    fontFamily: sans,
                    fontWeight: 500,
                    opacity: hoveredMsgId === msg.id || savedMsgIds.has(msg.id) ? 1 : 0,
                    transition: "opacity 0.15s, border-color 0.15s, color 0.15s",
                    pointerEvents: savedMsgIds.has(msg.id) ? "none" : "auto",
                  }}
                >
                  {savedMsgIds.has(msg.id)
                    ? <BookmarkCheck size={12} strokeWidth={2} />
                    : <Bookmark size={12} strokeWidth={2} />
                  }
                  {savedMsgIds.has(msg.id) ? "Saved to My Plan" : "Save to My Plan"}
                </button>
              )}
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
        @keyframes berryPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.72; transform: scale(0.88); }
        }
      `}</style>
    </div>
  );
}
