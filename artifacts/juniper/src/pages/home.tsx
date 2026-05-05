import { useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { AppSidebar, Artifact, Conversation } from "@/components/app-sidebar";
import { ChatInterface } from "@/components/chat/chat-interface";

const SESSION_KEY = "juniper_admin_auth";
const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const MOCK_USER = "Alex";

// ── Password gate ──────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "juniper") {
      sessionStorage.setItem(SESSION_KEY, "1");
      onUnlock();
    } else {
      setError(true);
      setPassword("");
    }
  };

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: cream, fontFamily: sans, padding: "0 24px",
    }}>
      <img src="/logo.png" alt="Juniper" style={{ width: 160, height: 160, objectFit: "contain", marginBottom: 18 }} />
      <h1 style={{ fontFamily: serif, fontSize: 22, color: sage, fontWeight: 500, margin: "0 0 4px" }}>Juniper</h1>
      <p style={{ color: muted, fontSize: 14, margin: "0 0 32px" }}>Private preview</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          autoFocus
          style={{
            height: 48, padding: "0 16px",
            border: `1px solid ${error ? "#b94040" : border}`,
            borderRadius: 8, background: "#fff", fontFamily: sans, fontSize: 16,
            color: ink, textAlign: "center", letterSpacing: "0.1em",
            outline: "none", boxSizing: "border-box",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = error ? "#b94040" : sage)}
          onBlur={(e) => (e.currentTarget.style.borderColor = error ? "#b94040" : border)}
        />
        {error && (
          <p style={{ color: "#b94040", fontSize: 12, textAlign: "center", margin: "-2px 0 0" }}>
            Incorrect password
          </p>
        )}
        <button
          type="submit"
          style={{
            height: 48, background: sage, color: "#fff", border: "none",
            borderRadius: 8, fontFamily: sans, fontSize: 15, fontWeight: 500,
            cursor: "pointer", transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Enter
        </button>
      </form>
    </div>
  );
}

// ── My Plan view ───────────────────────────────────────────────────────────
function MyPlanView({ artifacts, userName, onStartConversation }: {
  artifacts: Artifact[];
  userName: string;
  onStartConversation: () => void;
}) {
  const typeLabel: Record<string, string> = {
    chart: "Chart",
    calculation: "Calculation",
    scenario: "Scenario",
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "52px 28px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <img src="/logo.png" alt="Juniper" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 20px", display: "block" }} />
          <h1 style={{
            fontFamily: serif, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400,
            color: ink, margin: "0 0 10px", letterSpacing: "-0.02em",
          }}>
            Your plan, {userName}.
          </h1>
          <p style={{ fontSize: 16, color: muted, margin: 0, lineHeight: 1.6 }}>
            Everything you've saved in one place.
          </p>
        </div>

        {artifacts.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <p style={{ fontSize: 16, color: muted, margin: "0 0 8px" }}>Nothing saved yet.</p>
            <p style={{ fontSize: 14, color: muted, margin: "0 0 32px", lineHeight: 1.65 }}>
              As you talk with Juniper, your charts and plans will collect here.
            </p>
            <button
              onClick={onStartConversation}
              style={{
                background: sage, color: "#fff", border: "none", borderRadius: 8,
                padding: "12px 28px", fontFamily: sans, fontSize: 14, fontWeight: 500,
                cursor: "pointer", transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 20,
          }}>
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                style={{
                  background: "#fff", border: `1px solid ${border}`,
                  borderRadius: 12, padding: "24px", cursor: "pointer",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
              >
                <p style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: sage, margin: "0 0 10px",
                }}>
                  {typeLabel[artifact.type]}
                </p>
                <p style={{ fontFamily: serif, fontSize: 18, color: ink, margin: "0 0 10px", fontWeight: 400, lineHeight: 1.3 }}>
                  {artifact.title}
                </p>
                {artifact.subtitle && (
                  <p style={{ fontSize: 24, fontWeight: 600, color: sage, margin: "0 0 14px", fontFamily: serif }}>
                    {artifact.subtitle}
                  </p>
                )}
                <p style={{ fontSize: 12, color: muted, margin: 0 }}>
                  Saved {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(artifact.savedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────
function AppShell() {
  const [view, setView] = useState<"chat" | "myPlan">("chat");
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }, []);

  const handleNewConversation = useCallback(() => {
    setView("chat");
    setActiveConvId(null);
    setChatKey((k) => k + 1);
    setSidebarOpen(false);
  }, []);

  const handleConversationStart = useCallback((title: string) => {
    const id = Date.now().toString();
    setConversations((prev) => [{ id, title, startedAt: new Date() }, ...prev]);
    setActiveConvId(id);
  }, []);

  const handleArtifactSaved = useCallback((artifact: Artifact) => {
    setArtifacts((prev) => (prev.find((a) => a.id === artifact.id) ? prev : [artifact, ...prev]));
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setView("chat");
    setActiveConvId(id);
    setSidebarOpen(false);
  }, []);

  const sidebarProps = {
    conversations,
    artifacts,
    activeConvId,
    view,
    onNewConversation: handleNewConversation,
    onSelectConversation: handleSelectConversation,
    onViewMyPlan: () => { setView("myPlan"); setSidebarOpen(false); },
    onSelectArtifact: () => { setView("myPlan"); setSidebarOpen(false); },
    onLogout: handleLogout,
    userName: MOCK_USER,
  };

  return (
    <div style={{ display: "flex", height: "100dvh", background: cream, overflow: "hidden", fontFamily: sans }}>
      {/* Desktop sidebar */}
      <div className="hidden lg:block" style={{ height: "100%", flexShrink: 0 }}>
        <AppSidebar {...sidebarProps} />
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(42,42,42,0.3)" }}
          />
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0 }}>
            <AppSidebar {...sidebarProps} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        {/* Mobile top bar */}
        <div
          className="lg:hidden"
          style={{
            display: "flex", alignItems: "center", padding: "12px 16px",
            borderBottom: `1px solid ${border}`, background: cream, flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: ink, display: "flex" }}
          >
            <Menu size={20} />
          </button>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
            <img src="/logo.png" alt="Juniper" style={{ width: 26, height: 26, objectFit: "contain" }} />
            <span style={{ fontFamily: serif, fontSize: 17, color: sage, fontWeight: 500 }}>Juniper</span>
          </div>
          <div style={{ width: 28 }} />
        </div>

        {/* View content */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {view === "chat" ? (
            <ChatInterface
              key={chatKey}
              userName={MOCK_USER}
              onConversationStart={handleConversationStart}
              onArtifactSaved={handleArtifactSaved}
            />
          ) : (
            <MyPlanView
              artifacts={artifacts}
              userName={MOCK_USER}
              onStartConversation={handleNewConversation}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page entry point ───────────────────────────────────────────────────────
export default function Home() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />;
  return <AppShell />;
}
