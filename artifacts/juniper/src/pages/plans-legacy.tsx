import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { Artifact } from "@/components/app-sidebar";
import { InlineChart, ChartSpec, parseSegments } from "@/components/chat/inline-chart";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const TYPE_LABEL: Record<string, string> = {
  chart: "Chart",
  calculation: "Calculation",
  scenario: "Scenario",
};

function tryParseChart(content?: string): ChartSpec | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as ChartSpec;
  } catch {
    return null;
  }
}

type Props = {
  artifacts: Artifact[];
  userName: string;
  onRenameArtifact: (id: string, title: string) => void;
  onDeleteArtifact: (id: string) => void;
};

export function PlansLegacy({ artifacts, userName, onRenameArtifact, onDeleteArtifact }: Props) {
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent, artifact: Artifact) {
    e.stopPropagation();
    setEditingId(artifact.id);
    setEditingValue(artifact.title);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    if (editingId && editingValue.trim()) onRenameArtifact(editingId, editingValue.trim());
    setEditingId(null);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "52px 28px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <img
            src="/logo.png"
            alt="Juniper"
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 20px", display: "block" }}
          />
          <h1
            style={{
              fontFamily: serif,
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 400,
              color: ink,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Your saved items, {userName}.
          </h1>
          <p style={{ fontSize: 16, color: muted, margin: 0, lineHeight: 1.6 }}>
            Everything you've saved from chat in one place.
          </p>
        </div>

        {artifacts.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <p style={{ fontSize: 16, color: muted, margin: "0 0 8px" }}>Nothing saved yet.</p>
            <p style={{ fontSize: 14, color: muted, margin: "0 0 32px", lineHeight: 1.65 }}>
              As you talk with Juniper, your charts and plans will collect here.
            </p>
            <button
              onClick={() => setLocation("/app/chat")}
              style={{
                background: sage,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 28px",
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
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
                  style={{
                    background: "#fff",
                    border: `1px solid ${border}`,
                    borderRadius: 12,
                    padding: "24px",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s",
                    position: "relative",
                    boxShadow: isHovered ? "0 2px 12px rgba(0,0,0,0.07)" : "none",
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteArtifact(artifact.id);
                    }}
                    aria-label="Delete"
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: muted,
                      opacity: isHovered ? 1 : 0,
                      transition: "opacity 0.12s, color 0.12s",
                      padding: 2,
                      display: "flex",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#b94040")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>

                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: sage,
                      margin: "0 0 10px",
                    }}
                  >
                    {TYPE_LABEL[artifact.type]}
                  </p>

                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      style={{
                        fontFamily: serif,
                        fontSize: 18,
                        color: ink,
                        fontWeight: 400,
                        lineHeight: 1.3,
                        width: "100%",
                        border: "none",
                        borderBottom: `1.5px solid ${sage}`,
                        background: "transparent",
                        outline: "none",
                        padding: "0 0 2px",
                        margin: "0 0 10px",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <p
                      onClick={(e) => startEdit(e, artifact)}
                      title="Click to rename"
                      style={{
                        fontFamily: serif,
                        fontSize: 18,
                        color: ink,
                        margin: "0 0 10px",
                        fontWeight: 400,
                        lineHeight: 1.3,
                        cursor: "text",
                      }}
                    >
                      {artifact.title}
                    </p>
                  )}

                  <p style={{ fontSize: 12, color: muted, margin: 0 }}>
                    Saved{" "}
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                      artifact.savedAt,
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openArtifact && (
        <div
          onClick={() => setOpenArtifact(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(42,42,42,0.4)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 680,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: "32px",
              position: "relative",
              boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
            }}
          >
            <button
              onClick={() => setOpenArtifact(null)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: muted,
                display: "flex",
              }}
            >
              <X size={18} strokeWidth={2} />
            </button>
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: sage,
                margin: "0 0 10px",
              }}
            >
              {TYPE_LABEL[openArtifact.type]}
            </p>
            <h2
              style={{
                fontFamily: serif,
                fontSize: 22,
                fontWeight: 400,
                color: ink,
                margin: "0 0 20px",
                lineHeight: 1.3,
              }}
            >
              {openArtifact.title}
            </h2>

            {openArtifact.type === "chart" && openArtifact.content ? (
              (() => {
                const spec = tryParseChart(openArtifact.content);
                return spec ? <InlineChart spec={spec} /> : null;
              })()
            ) : openArtifact.content ? (
              <div style={{ fontSize: 15, color: ink, lineHeight: 1.7 }}>
                {parseSegments(openArtifact.content).map((seg, i) => {
                  if (seg.kind === "chart") return <InlineChart key={i} spec={seg.spec} />;
                  if (seg.kind === "text")
                    return (
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
              Saved{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }).format(openArtifact.savedAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
