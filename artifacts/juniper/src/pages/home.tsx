import { useState, useCallback, useRef, useEffect } from "react";
import { Menu, CheckCircle2, ClipboardList, LogOut, X } from "lucide-react";
import { AppSidebar, Artifact, Conversation } from "@/components/app-sidebar";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ProfileQuestionnaire } from "@/components/chat/profile-questionnaire";
import { InlineChart, ChartSpec, parseSegments } from "@/components/chat/inline-chart";
import { UserProfile, loadProfile, saveProfile } from "@/lib/profile";

const SESSION_KEY = "juniper_admin_auth";
const NAME_KEY = "juniper_user_name";
const EMAIL_KEY = "juniper_user_email";
const ARTIFACTS_KEY = "juniper_artifacts";
const CONVERSATIONS_KEY = "juniper_conversations";

function artifactsKey(email?: string) {
  return email ? `juniper_artifacts_${email}` : ARTIFACTS_KEY;
}

function conversationsKey(email?: string) {
  return email ? `juniper_conversations_${email}` : CONVERSATIONS_KEY;
}

function loadArtifacts(email?: string): Artifact[] {
  try {
    const raw = localStorage.getItem(artifactsKey(email));
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Artifact & { savedAt: string }>).map((a) => ({
      ...a,
      savedAt: new Date(a.savedAt),
    }));
  } catch { return []; }
}

function saveArtifacts(artifacts: Artifact[], email?: string) {
  localStorage.setItem(artifactsKey(email), JSON.stringify(artifacts));
}

function loadConversations(email?: string): Conversation[] {
  try {
    const raw = localStorage.getItem(conversationsKey(email));
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Conversation & { startedAt: string }>).map((c) => ({
      ...c,
      startedAt: new Date(c.startedAt),
    }));
  } catch { return []; }
}

function saveConversations(conversations: Conversation[], email?: string) {
  localStorage.setItem(conversationsKey(email), JSON.stringify(conversations));
}
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
      saveProfile(profile, trimmedEmail);
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
        <span style={{ fontFamily: sans, fontSize: 16, color: "#fff", fontWeight: 600, lineHeight: 1 }}>{initials}</span>
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
function MyPlanView({ artifacts, userName, onStartConversation, onRenameArtifact, onDeleteArtifact }: {
  artifacts: Artifact[];
  userName: string;
  onStartConversation: () => void;
  onRenameArtifact: (id: string, title: string) => void;
  onDeleteArtifact: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const typeLabel: Record<string, string> = { chart: "Chart", calculation: "Calculation", scenario: "Scenario" };

  function startEdit(e: React.MouseEvent, artifact: Artifact) {
    e.stopPropagation();
    setEditingId(artifact.id);
    setEditingValue(artifact.title);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  }

  function commitEdit() {
    if (editingId && editingValue.trim()) onRenameArtifact(editingId, editingValue.trim());
    setEditingId(null);
  }

  // Try to parse a chart spec from content
  function tryParseChart(content?: string): ChartSpec | null {
    if (!content) return null;
    try { return JSON.parse(content) as ChartSpec; } catch { return null; }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "52px 28px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <img src="/logo.png" alt="Juniper" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 20px", display: "block" }} />
          <h1 style={{ fontFamily: serif, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400, color: ink, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            Your plan, {userName}.
          </h1>
          <p style={{ fontSize: 16, color: muted, margin: 0, lineHeight: 1.6 }}>Everything you've saved in one place.</p>
        </div>

        {artifacts.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <p style={{ fontSize: 16, color: muted, margin: "0 0 8px" }}>Nothing saved yet.</p>
            <p style={{ fontSize: 14, color: muted, margin: "0 0 32px", lineHeight: 1.65 }}>As you talk with Juniper, your charts and plans will collect here.</p>
            <button onClick={onStartConversation} style={{ background: sage, color: "#fff", border: "none", borderRadius: 8, padding: "12px 28px", fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              Start a conversation
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {artifacts.map((artifact) => {
              const isEditing = editingId === artifact.id;
              const isHovered = hoveredCardId === artifact.id;
              return (
                <div
                  key={artifact.id}
                  onClick={() => !isEditing && setOpenArtifact(artifact)}
                  onMouseEnter={() => setHoveredCardId(artifact.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: "24px", cursor: "pointer", transition: "box-shadow 0.15s", position: "relative", boxShadow: isHovered ? "0 2px 12px rgba(0,0,0,0.07)" : "none" }}
                >
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteArtifact(artifact.id); }}
                    aria-label="Delete"
                    style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: muted, opacity: isHovered ? 1 : 0, transition: "opacity 0.12s, color 0.12s", padding: 2, display: "flex" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#b94040")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>

                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: sage, margin: "0 0 10px" }}>
                    {typeLabel[artifact.type]}
                  </p>

                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditingId(null); }}
                      style={{ fontFamily: serif, fontSize: 18, color: ink, fontWeight: 400, lineHeight: 1.3, width: "100%", border: "none", borderBottom: `1.5px solid ${sage}`, background: "transparent", outline: "none", padding: "0 0 2px", margin: "0 0 10px", boxSizing: "border-box" }}
                    />
                  ) : (
                    <p onClick={(e) => startEdit(e, artifact)} title="Click to rename" style={{ fontFamily: serif, fontSize: 18, color: ink, margin: "0 0 10px", fontWeight: 400, lineHeight: 1.3, cursor: "text" }}>
                      {artifact.title}
                    </p>
                  )}

                  <p style={{ fontSize: 12, color: muted, margin: 0 }}>
                    Saved {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(artifact.savedAt)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {openArtifact && (
        <div
          onClick={() => setOpenArtifact(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(42,42,42,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "32px", position: "relative", boxShadow: "0 8px 40px rgba(0,0,0,0.14)" }}
          >
            <button onClick={() => setOpenArtifact(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: muted, display: "flex" }}>
              <X size={18} strokeWidth={2} />
            </button>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: sage, margin: "0 0 10px" }}>
              {typeLabel[openArtifact.type]}
            </p>
            <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, color: ink, margin: "0 0 20px", lineHeight: 1.3 }}>
              {openArtifact.title}
            </h2>

            {openArtifact.type === "chart" && openArtifact.content ? (
              (() => { const spec = tryParseChart(openArtifact.content); return spec ? <InlineChart spec={spec} /> : null; })()
            ) : openArtifact.content ? (
              <div style={{ fontSize: 15, color: ink, lineHeight: 1.7 }}>
                {parseSegments(openArtifact.content).map((seg, i) => {
                  if (seg.kind === "chart") return <InlineChart key={i} spec={seg.spec} />;
                  if (seg.kind === "text") return (
                    <p key={i} style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
                      {seg.content.replace(/\*\*([^*]+)\*\*/g, "$1").trim()}
                    </p>
                  );
                  return null;
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: muted }}>No content stored for this item.</p>
            )}

            <p style={{ fontSize: 12, color: muted, margin: "20px 0 0" }}>
              Saved {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(openArtifact.savedAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────
function AppShell({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [view, setView] = useState<"chat" | "myPlan">("chat");
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations(userEmail));
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => loadArtifacts(userEmail));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(() => loadProfile(userEmail));
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

  const handleRenameArtifact = useCallback((id: string, title: string) => {
    setArtifacts((prev) => prev.map((a) => a.id === id ? { ...a, title } : a));
  }, []);

  const handleDeleteArtifact = useCallback((id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Persist to localStorage + debounced Supabase save on every change
  const remoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    saveArtifacts(artifacts, userEmail);
    saveConversations(conversations, userEmail);
    if (!userEmail) return;
    if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = setTimeout(() => {
      fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, name: userName, artifacts, conversations }),
      }).catch(() => {});
    }, 2000);
  }, [artifacts, conversations, userEmail, userName]);

  // On mount: hydrate from Supabase (remote beats localStorage when non-empty)
  useEffect(() => {
    if (!userEmail) return;
    fetch(`/api/profile?email=${encodeURIComponent(userEmail)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) return;
        if (Array.isArray(data.artifacts) && (data.artifacts as unknown[]).length > 0) {
          const parsed = (data.artifacts as Array<Artifact & { savedAt: string }>).map((a) => ({
            ...a, savedAt: new Date(a.savedAt),
          }));
          setArtifacts(parsed);
          saveArtifacts(parsed, userEmail);
        }
        if (Array.isArray(data.conversations) && (data.conversations as unknown[]).length > 0) {
          const parsed = (data.conversations as Array<Conversation & { startedAt: string }>).map((c) => ({
            ...c, startedAt: new Date(c.startedAt),
          }));
          setConversations(parsed);
          saveConversations(parsed, userEmail);
        }
      })
      .catch(() => {});
  }, [userEmail]); // intentionally runs once on mount

  const handleSelectConversation = useCallback((id: string) => {
    setView("chat");
    setActiveConvId(id);
    setChatKey((k) => k + 1);
    setSidebarOpen(false);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConvId((prev) => prev === id ? null : prev);
  }, []);

  const handleConversationMessagesUpdate = useCallback((id: string, messages: Array<{ role: "user" | "assistant"; content: string }>) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, messages } : c));
  }, []);

  // Stable ref so the callback passed to ChatInterface never goes stale
  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const handleMessagesUpdateStable = useCallback((messages: Array<{ role: "user" | "assistant"; content: string }>) => {
    const id = activeConvIdRef.current;
    if (id) handleConversationMessagesUpdate(id, messages);
  }, [handleConversationMessagesUpdate]);

  const handleProfileSave = useCallback((p: UserProfile) => {
    saveProfile(p, userEmail);
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
    onDeleteConversation: handleDeleteConversation,
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
              onOpenProfile={() => setShowQuestionnaire(true)}
              initialMessages={activeConvId ? conversations.find((c) => c.id === activeConvId)?.messages : undefined}
              onMessagesUpdate={handleMessagesUpdateStable}
            />
          ) : (
            <MyPlanView
              artifacts={artifacts}
              userName={userName}
              onStartConversation={handleNewConversation}
              onRenameArtifact={handleRenameArtifact}
              onDeleteArtifact={handleDeleteArtifact}
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
          if (remoteProfile) saveProfile(remoteProfile, email);
          setAuthed(true);
        }}
      />
    );
  }
  return <AppShell userName={userName} userEmail={userEmail} />;
}
