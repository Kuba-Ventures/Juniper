import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Menu } from "lucide-react";
import { AppSidebar, type Artifact, type Conversation } from "@/components/app-sidebar";
import { ProfileQuestionnaire } from "@/components/chat/profile-questionnaire";
import { UserProfile, loadProfile, saveProfile } from "@/lib/profile";
import { supabase, getAccessToken } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { Dashboard } from "@/pages/dashboard";
import { ChatPage } from "@/pages/chat";
import { PlansLegacy } from "@/pages/plans-legacy";
import { PlanStub } from "@/pages/plan-stub";
import { ConnectionsView } from "@/pages/connections";
import type { Domain } from "@/components/dashboard/domain-tile-grid";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const ARTIFACTS_KEY = (email: string) => `juniper_artifacts_${email}`;
const CONVERSATIONS_KEY = (email: string) => `juniper_conversations_${email}`;

function loadLocalArtifacts(email: string): Artifact[] {
  try {
    const raw = localStorage.getItem(ARTIFACTS_KEY(email));
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Artifact & { savedAt: string }>).map((a) => ({
      ...a,
      savedAt: new Date(a.savedAt),
    }));
  } catch {
    return [];
  }
}

function loadLocalConversations(email: string): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY(email));
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Conversation & { startedAt: string }>).map((c) => ({
      ...c,
      startedAt: new Date(c.startedAt),
    }));
  } catch {
    return [];
  }
}

const EMAIL_NAME_OVERRIDES: Record<string, string> = {
  "yanastali@gmail.com": "Asta",
};

function nameFromEmail(email: string): string {
  if (EMAIL_NAME_OVERRIDES[email]) return EMAIL_NAME_OVERRIDES[email];
  const local = email.split("@")[0];
  const first = local.split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function fetchRemoteProfile(): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function postRemoteProfile(body: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    await fetch("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}

function AccountTopBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="lg:hidden"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${border}`,
        background: cream,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

export default function AppShell() {
  const session = useSession();
  const [, setLocation] = useLocation();

  const userEmail = session?.user.email?.toLowerCase() ?? "";
  const initialName = useMemo(() => {
    if (!userEmail) return "there";
    const metaName = (session?.user.user_metadata as { name?: string } | undefined)?.name;
    return metaName?.trim() || nameFromEmail(userEmail);
  }, [session, userEmail]);

  const [displayName, setDisplayName] = useState(initialName);
  useEffect(() => setDisplayName(initialName), [initialName]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [pendingPlanDomain, setPendingPlanDomain] = useState<Domain | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Hydrate from localStorage as soon as we know the email
  useEffect(() => {
    if (!userEmail) return;
    setConversations(loadLocalConversations(userEmail));
    setArtifacts(loadLocalArtifacts(userEmail));
    setProfileState(loadProfile(userEmail));
  }, [userEmail]);

  // Hydrate from Supabase on mount; remote beats localStorage when non-empty
  useEffect(() => {
    if (!userEmail) return;
    fetchRemoteProfile().then((data) => {
      if (!data) return;
      const next: UserProfile = {
        monthlyIncome: data.monthly_income as number | undefined,
        monthlyExpenses: data.monthly_expenses as number | undefined,
        totalSavings: data.total_savings as number | undefined,
        totalDebt: data.total_debt as number | undefined,
        goals: data.goals as string[] | undefined,
        completedAt: data.updated_at as string | undefined,
      };
      setProfileState(next);
      saveProfile(next, userEmail);
      if (typeof data.name === "string" && data.name.trim()) {
        setDisplayName(data.name.trim());
      }
      if (Array.isArray(data.artifacts) && data.artifacts.length > 0) {
        const parsed = (data.artifacts as Array<Artifact & { savedAt: string }>).map((a) => ({
          ...a,
          savedAt: new Date(a.savedAt),
        }));
        setArtifacts(parsed);
        localStorage.setItem(ARTIFACTS_KEY(userEmail), JSON.stringify(parsed));
      }
      if (Array.isArray(data.conversations) && data.conversations.length > 0) {
        const parsed = (data.conversations as Array<Conversation & { startedAt: string }>).map((c) => ({
          ...c,
          startedAt: new Date(c.startedAt),
        }));
        setConversations(parsed);
        localStorage.setItem(CONVERSATIONS_KEY(userEmail), JSON.stringify(parsed));
      }
    });
  }, [userEmail]);

  // Persist to localStorage + debounced remote save on every change
  const remoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userEmail) return;
    localStorage.setItem(ARTIFACTS_KEY(userEmail), JSON.stringify(artifacts));
    localStorage.setItem(CONVERSATIONS_KEY(userEmail), JSON.stringify(conversations));
    if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = setTimeout(() => {
      postRemoteProfile({ name: displayName, artifacts, conversations });
    }, 2000);
  }, [artifacts, conversations, userEmail, displayName]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setLocation("/");
  }, [setLocation]);

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setChatKey((k) => k + 1);
    setSidebarOpen(false);
    setLocation("/app/chat");
  }, [setLocation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConvId(id);
      setChatKey((k) => k + 1);
      setSidebarOpen(false);
      setLocation("/app/chat");
    },
    [setLocation],
  );

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConvId((prev) => (prev === id ? null : prev));
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
    setArtifacts((prev) => prev.map((a) => (a.id === id ? { ...a, title } : a)));
  }, []);

  const handleDeleteArtifact = useCallback((id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const handleConversationMessagesUpdate = useCallback(
    (messages: Array<{ role: "user" | "assistant"; content: string }>) => {
      const id = activeConvIdRef.current;
      if (!id) return;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, messages } : c)));
    },
    [],
  );

  const handleProfileSave = useCallback(
    (p: UserProfile, name: string) => {
      saveProfile(p, userEmail);
      setProfileState(p);
      if (name && name !== displayName) setDisplayName(name);
      setShowQuestionnaire(false);
      postRemoteProfile({
        name: name || displayName,
        monthly_income: p.monthlyIncome ?? null,
        monthly_expenses: p.monthlyExpenses ?? null,
        total_savings: p.totalSavings ?? null,
        total_debt: p.totalDebt ?? null,
        goals: p.goals ?? null,
      });
      if (pendingPlanDomain) {
        const d = pendingPlanDomain;
        setPendingPlanDomain(null);
        setLocation(`/app/plans/${d}`);
      }
    },
    [userEmail, displayName, pendingPlanDomain, setLocation],
  );

  const handleQuestionnaireClose = useCallback(() => {
    setShowQuestionnaire(false);
    setPendingPlanDomain(null);
  }, []);

  const handleStartPlan = useCallback(
    (domain: Domain) => {
      const isOnboarded = profile?.monthlyIncome != null;
      if (!isOnboarded) {
        setPendingPlanDomain(domain);
        setShowQuestionnaire(true);
        return;
      }
      setLocation(`/app/plans/${domain}`);
    },
    [profile, setLocation],
  );

  const sidebarProps = {
    conversations,
    activeConvId,
    onNewConversation: handleNewConversation,
    onSelectConversation: handleSelectConversation,
    onDeleteConversation: handleDeleteConversation,
    onLogout: handleSignOut,
    userName: displayName,
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        background: cream,
        overflow: "hidden",
        fontFamily: sans,
      }}
    >
      <div className="hidden lg:block" style={{ height: "100%", flexShrink: 0 }}>
        <AppSidebar {...sidebarProps} />
      </div>

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

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
          position: "relative",
        }}
      >
        <AccountTopBar>
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
          <button
            onClick={() => setShowQuestionnaire(true)}
            style={{
              fontFamily: sans,
              fontSize: 13,
              color: sage,
              background: "transparent",
              border: `1.5px solid ${sage}`,
              borderRadius: 8,
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {displayName.split(" ")[0]}
          </button>
        </AccountTopBar>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Switch>
            <Route path="/app">
              <Dashboard userName={displayName} onStartPlan={handleStartPlan} />
            </Route>
            <Route path="/app/chat">
              <ChatPage
                userName={displayName}
                profile={profile}
                activeConvId={activeConvId}
                conversations={conversations}
                chatKey={chatKey}
                onConversationStart={handleConversationStart}
                onArtifactSaved={handleArtifactSaved}
                onOpenProfile={() => setShowQuestionnaire(true)}
                onMessagesUpdate={handleConversationMessagesUpdate}
              />
            </Route>
            <Route path="/app/plans">
              <PlansLegacy
                artifacts={artifacts}
                userName={displayName}
                onRenameArtifact={handleRenameArtifact}
                onDeleteArtifact={handleDeleteArtifact}
              />
            </Route>
            <Route path="/app/plans/:domain">
              {(params) => <PlanStub domain={params.domain} />}
            </Route>
            <Route path="/app/connections">
              <ConnectionsView />
            </Route>
            <Route>
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: muted,
                  fontFamily: sans,
                }}
              >
                Page not found.
              </div>
            </Route>
          </Switch>
        </div>
      </div>

      {showQuestionnaire && (
        <ProfileQuestionnaire
          initialData={profile ?? undefined}
          initialName={displayName}
          onClose={handleQuestionnaireClose}
          onSave={handleProfileSave}
        />
      )}
    </div>
  );
}
