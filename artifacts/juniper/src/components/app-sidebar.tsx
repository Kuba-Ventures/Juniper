import { useState } from "react";
import { BarChart2, Calculator, GitFork, Plus, ChevronDown, X } from "lucide-react";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

export type Artifact = {
  id: string;
  type: "chart" | "calculation" | "scenario";
  title: string;
  subtitle?: string;
  savedAt: Date;
  content?: string;
};

export type Conversation = {
  id: string;
  title: string;
  startedAt: Date;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
};

type SidebarProps = {
  conversations: Conversation[];
  artifacts: Artifact[];
  activeConvId: string | null;
  view: "chat" | "myPlan";
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onViewMyPlan: () => void;
  onSelectArtifact: (id: string) => void;
  onLogout: () => void;
  userName: string;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const artifactIcon: Record<string, React.ReactNode> = {
  chart: <BarChart2 size={13} />,
  calculation: <Calculator size={13} />,
  scenario: <GitFork size={13} />,
};

export function AppSidebar({
  conversations,
  artifacts,
  activeConvId,
  view,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onViewMyPlan,
  onSelectArtifact,
  onLogout,
  userName,
}: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: 260,
        minWidth: 260,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: cream,
        borderRight: `1px solid ${border}`,
        fontFamily: sans,
      }}
    >
      {/* Logo */}
      <button
        onClick={onNewConversation}
        aria-label="Go to home"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "22px 20px 18px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <img src="/logo.png" alt="Juniper" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
        <span style={{ fontFamily: serif, fontSize: 18, color: sage, fontWeight: 500, letterSpacing: "-0.01em" }}>
          Juniper
        </span>
      </button>

      {/* New conversation */}
      <div style={{ padding: "0 14px 22px" }}>
        <button
          onClick={onNewConversation}
          aria-label="Start new conversation"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "10px 16px",
            background: sage,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontFamily: sans,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <Plus size={15} strokeWidth={2.5} />
          New conversation
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {/* My Plan */}
        <section aria-label="My Plan" style={{ marginBottom: 28 }}>
          <button
            onClick={onViewMyPlan}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 4px",
              marginBottom: 8,
              display: "block",
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: muted, fontFamily: sans,
            }}>
              My Plan
            </span>
          </button>

          {artifacts.length === 0 ? (
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, padding: "2px 4px" }}>
              Your saved charts and plans will appear here.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {artifacts.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => onSelectArtifact(a.id)}
                    style={{
                      width: "100%", textAlign: "left", background: "none", border: "none",
                      borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                      display: "flex", alignItems: "flex-start", gap: 8, transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(92,122,101,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span style={{ color: muted, marginTop: 1, flexShrink: 0 }}>{artifactIcon[a.type]}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: ink, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                        {a.title}
                      </p>
                      <p style={{ fontSize: 11, color: muted, margin: "2px 0 0" }}>{timeAgo(a.savedAt)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Conversations */}
        <section aria-label="Past conversations">
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: muted, margin: "0 0 8px 4px", fontFamily: sans,
          }}>
            Conversations
          </p>

          {conversations.length === 0 ? (
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, padding: "2px 4px" }}>
              Your conversations will appear here.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {conversations.map((conv) => {
                const isActive = conv.id === activeConvId && view === "chat";
                const isHovered = hoveredConvId === conv.id;
                return (
                  <li
                    key={conv.id}
                    onMouseEnter={() => setHoveredConvId(conv.id)}
                    onMouseLeave={() => setHoveredConvId(null)}
                    style={{ position: "relative", display: "flex", alignItems: "stretch" }}
                  >
                    {/* Delete button — left edge, visible on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                      aria-label="Delete conversation"
                      style={{
                        flexShrink: 0, width: 24, border: "none", background: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: muted, opacity: isHovered ? 1 : 0,
                        transition: "opacity 0.12s, color 0.12s",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#b94040")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>

                    <button
                      onClick={() => onSelectConversation(conv.id)}
                      aria-current={isActive ? "page" : undefined}
                      style={{
                        flex: 1, textAlign: "left", border: "none",
                        borderLeft: isActive ? `3px solid ${sage}` : "3px solid transparent",
                        borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                        background: isActive ? "rgba(92,122,101,0.09)" : isHovered ? "rgba(92,122,101,0.06)" : "none",
                        transition: "background 0.12s",
                      }}
                    >
                      <p style={{
                        fontSize: 13, color: ink, margin: 0,
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                        fontWeight: isActive ? 500 : 400,
                        lineHeight: 1.4,
                      }}>
                        {conv.title}
                      </p>
                      <p style={{ fontSize: 11, color: muted, margin: "2px 0 0" }}>{timeAgo(conv.startedAt)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* User identity */}
      <div style={{ borderTop: `1px solid ${border}`, padding: "14px" }}>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 9,
              background: "none", border: "none", borderRadius: 8, padding: "8px 10px",
              cursor: "pointer", transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(92,122,101,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <div style={{
              width: 30, height: 30, borderRadius: "50%", background: sage, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: serif, fontSize: 12, color: "#fff", fontStyle: "italic" }}>{initials}</span>
            </div>
            <span style={{ flex: 1, textAlign: "left", fontSize: 13, color: ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {userName}
            </span>
            <ChevronDown size={13} color={muted} style={{ transition: "transform 0.15s", transform: userMenuOpen ? "rotate(180deg)" : "none" }} />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0,
                background: "#fff", border: `1px solid ${border}`, borderRadius: 10,
                boxShadow: "0 4px 20px rgba(0,0,0,0.09)", overflow: "hidden", zIndex: 50,
              }}
            >
              {(
                [
                  { label: "Settings", action: () => setUserMenuOpen(false) },
                  { label: "Invite partner (coming soon)", action: () => {}, disabled: true },
                  { label: "Log out", action: onLogout, danger: true },
                ] as { label: string; action: () => void; disabled?: boolean; danger?: boolean }[]
              ).map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={item.action}
                  disabled={item.disabled}
                  style={{
                    width: "100%", textAlign: "left", background: "none", border: "none",
                    padding: "11px 16px", fontSize: 13, fontFamily: sans, transition: "background 0.1s",
                    color: item.disabled ? muted : item.danger ? "#b94040" : ink,
                    cursor: item.disabled ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = cream; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
