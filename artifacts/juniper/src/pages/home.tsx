import { useState, useCallback, useRef, useEffect } from "react";
import { Menu, User, CheckCircle2, ClipboardList, LogOut } from "lucide-react";
import { AppSidebar, Artifact, Conversation } from "@/components/app-sidebar";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ProfileQuestionnaire } from "@/components/chat/profile-questionnaire";
import { UserProfile, loadProfile, saveProfile } from "@/lib/profile";

const SESSION_KEY = "juniper_admin_auth";
const NAME_KEY = "juniper_user_name";
const EMAIL_KEY = "juniper_user_email";
const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

function getSavedName() { return localStorage.getItem(NAME_KEY) || ""; }
function getSavedEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }

async function fetchRemoteProfile(email: string): Promise<{ name?: string } & UserProfile | null> {
  try {
    const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveRemoteProfile(email: string, name: string, profile: UserProfile) {
  try {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        monthly_income: profile.monthlyIncome ?? null,
        monthly_expenses: profile.monthlyExpenses ?? null,
        total_savings: profile.totalSavings ?? null,
        total_debt: profile.totalDebt ?? null,
        goals: profile.goals ?? null,
      }),
    });
  } catch { /* non-fatal */ }
}

// ── Password gate ──────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: {
  onUnlock: (name: string, email: string, profile: UserProfile | null) => void;
}) {
  const [name, setName] = useState(() => getSavedName());
  const [email, setEmail] = useState(() => getSavedEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputStyle = (hasError = false) => ({
    height: 48, padding: "0 16px",
    border: `1px solid ${hasError ? "#b94040" : border}`,
    borderRadius: 8, background: "#fff", fontFamily: sans, fontSize: 16,
    color: ink, outline: "none", boxSizing: "border-box" as const, width: "100%",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== "juniper") { setError(true); setPassword(""); return; }

    setLoading(true);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    // Try to load existing profile from Supabase
    let remoteProfile: ({ name?: string } & UserProfile) | null = null;
    if (trimmedEmail) remoteProfile = await fetchRemoteProfile(trimmedEmail);

    const resolvedName = remoteProfile?.name || trimmedName || "there";

    // Merge remote profile into local UserProfile shape
    let profile: UserProfile | null = null;
    if (remoteProfile) {
      profile = {
        monthlyIncome: (remoteProfile as Record<string, unknown>)["monthly_income"] as number | undefined,
        monthlyExpenses: (remoteProfile as Record<string, unknown>)["monthly_expenses"] as number | undefined,
        totalSavings: (remoteProfile as Record<string, unknown>)["total_savings"] as number | undefined,
        totalDebt: (remoteProfile as Record<string, unknown>)["total_debt"] as number | undefined,
        goals: (remoteProfile as Record<string, unknown>)["goals"] as string[] | undefined,
        completedAt: (remoteProfile as Record<string, unknown>)["updated_at"] as string | undefined,
      };
      saveProfile(profile);
    }

    localStorage.setItem(NAME_KEY, resolvedName);
    if (trimmedEmail) localStorage.setItem(EMAIL_KEY, trimmedEmail);
    sessionStorage.setItem(SESSION_KEY, "1");

    // If new user with email, create their record
    if (trimmedEmail && !remoteProfile) {
      await saveRemoteProfile(trimmedEmail, resolvedName, {});
    }

    setLoading(false);
    onUnlock(resolvedName, trimmedEmail, profile);
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
          type="text"
          placeholder="First name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="given-name"
          style={inputStyle()}
          onFocus={(e) => (e.currentTarget.style.borderColor = sage)}
          onBlur={(e) => (e.currentTarget.style.borderColor = border)}
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={inputStyle()}
          onFocus={(e) => (e.currentTarget.style.borderColor = sage)}
          onBlur={(e) => (e.currentTarget.style.borderColor = border)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          style={{ ...inputStyle(error), textAlign: "center", letterSpacing: "0.1em" }}
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
          disabled={loading}
          style={{
            height: 48, background: sage, color: "#fff", border: "none",
            borderRadius: 8, fontFamily: sans, fontSize: 15, fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1, transition: "opacity 0.15s",
          }}
        >
          {loading ? "Signing in..." : "Enter"}
        </button>
      </form>
    </div>
  );
}

// ── Account button + dropdown ──────────────────────────────────────────────
function AccountButton({
  userName,
  profile,
  onEditProfile,
  onLogout,
}: {
  userName: string;
  profile: UserProfile | null;
  onEditProfile: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = userName.slice(0, 1).toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        style={{
          width: 34, height: 34, borderRadius: "50%",
          background: sage, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <span style={{ fontFamily: serif, fontSize: 13, color: "#fff", fontStyle: "italic" }}>{initials}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: `1px solid ${border}`, borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden",
          zIndex: 100, minWidth: 220, fontFamily: sans,
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${border}` }}>
            <p style={{ fontSize: 11, color: muted, margin: "0 0 6px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Your account</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: ink, margin: 0 }}>{userName}</p>
          </div>

          {/* Profile item */}
          <button
            onClick={() => { setOpen(false); onEditProfile(); }}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = cream)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {profile?.completedAt
              ? <CheckCircle2 size={14} color={sage} />
              : <ClipboardList size={14} color={muted} />
            }
            <span style={{ fontSize: 13, color: ink }}>
              {profile?.completedAt ? "Financial profile" : "Set up financial profile"}
            </span>
            {profile?.completedAt && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: sage, fontWeight: 500 }}>Complete</span>
            )}
          </button>

          <div style={{ borderTop: `1px solid ${border}` }} />

          {/* Log out */}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = cream)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <LogOut size={14} color={muted} />
            <span style={{ fontSize: 13, color: "#b94040" }}>Log out</span>
          </button>
        </div>
      )}
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
function AppShell({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [view, setView] = useState<"chat" | "myPlan">("chat");
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(() => loadProfile());
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

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

  const handleProfileSave = useCallback((p: UserProfile) => {
    saveProfile(p);
    setProfile(p);
    setShowQuestionnaire(false);
    if (userEmail) saveRemoteProfile(userEmail, userName, p);
  }, [userEmail, userName]);

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
    userName: userName,
  };

  const accountButtonProps = {
    userName: userName,
    profile,
    onEditProfile: () => setShowQuestionnaire(true),
    onLogout: handleLogout,
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%", position: "relative" }}>

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
          <AccountButton {...accountButtonProps} />
        </div>

        {/* Desktop account button — top right of main area */}
        <div
          className="hidden lg:flex"
          style={{ position: "absolute", top: 14, right: 20, zIndex: 40, alignItems: "center" }}
        >
          <AccountButton {...accountButtonProps} />
        </div>

        {/* View content */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {view === "chat" ? (
            <ChatInterface
              key={chatKey}
              userName={userName}
              profile={profile}
              onConversationStart={handleConversationStart}
              onArtifactSaved={handleArtifactSaved}
            />
          ) : (
            <MyPlanView
              artifacts={artifacts}
              userName={userName}
              onStartConversation={handleNewConversation}
            />
          )}
        </div>
      </div>

      {/* Profile questionnaire modal */}
      {showQuestionnaire && (
        <ProfileQuestionnaire
          initialData={profile ?? undefined}
          onClose={() => setShowQuestionnaire(false)}
          onSave={handleProfileSave}
        />
      )}
    </div>
  );
}

// ── Page entry point ───────────────────────────────────────────────────────
export default function Home() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [userName, setUserName] = useState(() => getSavedName() || "there");
  const [userEmail, setUserEmail] = useState(() => getSavedEmail());

  if (!authed) {
    return (
      <PasswordGate
        onUnlock={(name, email, remoteProfile) => {
          setUserName(name);
          setUserEmail(email);
          if (remoteProfile) saveProfile(remoteProfile);
          setAuthed(true);
        }}
      />
    );
  }
  return <AppShell userName={userName} userEmail={userEmail} />;
}
