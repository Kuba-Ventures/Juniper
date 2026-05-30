import { useState } from "react";
import { Copy, X } from "lucide-react";
import { createInvite } from "@/lib/invites";
import type { Plan } from "@/lib/plans";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type Props = {
  plan: Plan;
  onInviteCreated?: () => void;
};

export function InvitePartnerCard({ plan, onInviteCreated }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [partnerName, setPartnerName] = useState(plan.partner_first_name ?? "");
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    plan.invite_token ? buildShareUrl(plan.invite_token) : null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partnerName_ = plan.partner_first_name?.trim() || partnerName.trim() || "your partner";
  const status =
    plan.partner_invite_status === "accepted" &&
    plan.partner_dialogue_status !== "completed"
      ? "accepted_in_progress"
      : plan.partner_invite_status === "invited"
        ? "invited"
        : "none";

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const result = await createInvite(plan.domain, partnerName.trim() || undefined);
    setCreating(false);
    if (!result) {
      setError("Could not create invite. Try again.");
      return;
    }
    setShareUrl(result.url);
    onInviteCreated?.();
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <section
        style={{
          marginBottom: 32,
          background: "#fff",
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "18px 22px",
        }}
      >
        {status === "accepted_in_progress" ? (
          <>
            <p style={{ fontFamily: serif, fontSize: 16, color: ink, margin: "0 0 4px" }}>
              {partnerName_} has joined.
            </p>
            <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.55 }}>
              They haven't walked through their version of the plan yet. Once they do, an alignment
              section will appear here showing where you agree and where you don't.
            </p>
          </>
        ) : status === "invited" ? (
          <>
            <p style={{ fontFamily: serif, fontSize: 16, color: ink, margin: "0 0 4px" }}>
              Waiting on {partnerName_} to accept.
            </p>
            <p style={{ fontSize: 13.5, color: muted, margin: "0 0 12px", lineHeight: 1.55 }}>
              Send them this link if they haven't received it.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                readOnly
                value={shareUrl ?? ""}
                onClick={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  height: 36,
                  padding: "0 12px",
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  background: cream,
                  fontFamily: sans,
                  fontSize: 13,
                  color: ink,
                  outline: "none",
                }}
              />
              <button
                onClick={handleCopy}
                style={{
                  height: 36,
                  padding: "0 14px",
                  background: sage,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontFamily: sans,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Copy size={13} strokeWidth={2.2} />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: serif, fontSize: 16, color: ink, margin: "0 0 4px" }}>
              Plan this with a partner.
            </p>
            <p style={{ fontSize: 13.5, color: muted, margin: "0 0 14px", lineHeight: 1.55 }}>
              Invite your partner to walk through the same plan independently. Juniper will surface
              where you align and where you'd want to talk things through.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: "9px 18px",
                background: "transparent",
                color: sage,
                border: `1.5px solid ${sage}`,
                borderRadius: 8,
                fontFamily: sans,
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Invite partner
            </button>
          </>
        )}
      </section>

      {modalOpen && (
        <div
          onClick={() => !creating && !shareUrl && setModalOpen(false)}
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
              maxWidth: 460,
              width: "100%",
              padding: "28px 28px 24px",
              position: "relative",
              boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
              fontFamily: sans,
            }}
          >
            <button
              onClick={() => setModalOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: muted,
                padding: 4,
                display: "flex",
              }}
            >
              <X size={18} />
            </button>

            {shareUrl ? (
              <>
                <h2
                  style={{
                    fontFamily: serif,
                    fontSize: 20,
                    fontWeight: 400,
                    color: ink,
                    margin: "0 0 6px",
                  }}
                >
                  Share this link with {partnerName_}.
                </h2>
                <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: "0 0 18px" }}>
                  When they open it, they'll be prompted to create an account and walk through their
                  own version of this plan.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 8 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    onClick={(e) => e.currentTarget.select()}
                    style={{
                      flex: 1,
                      height: 38,
                      padding: "0 12px",
                      border: `1px solid ${border}`,
                      borderRadius: 8,
                      background: cream,
                      fontFamily: sans,
                      fontSize: 13,
                      color: ink,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    style={{
                      height: 38,
                      padding: "0 14px",
                      background: sage,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontFamily: sans,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Copy size={13} strokeWidth={2.2} />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    marginTop: 14,
                    padding: "9px 18px",
                    background: "transparent",
                    color: muted,
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    fontFamily: sans,
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2
                  style={{
                    fontFamily: serif,
                    fontSize: 20,
                    fontWeight: 400,
                    color: ink,
                    margin: "0 0 6px",
                  }}
                >
                  Invite your partner
                </h2>
                <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: "0 0 18px" }}>
                  We'll generate a shareable link. You decide how to send it.
                </p>
                <label
                  style={{
                    fontSize: 12,
                    color: muted,
                    fontFamily: sans,
                    fontWeight: 500,
                    display: "block",
                    margin: "0 0 6px",
                  }}
                >
                  Partner's first name (optional)
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="e.g. Alex"
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 14px",
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    background: "#fff",
                    fontFamily: sans,
                    fontSize: 14.5,
                    color: ink,
                    outline: "none",
                    boxSizing: "border-box",
                    marginBottom: 18,
                  }}
                />
                {error && (
                  <p style={{ color: "#b94040", fontSize: 12, margin: "0 0 12px" }}>{error}</p>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setModalOpen(false)}
                    style={{
                      padding: "9px 18px",
                      background: "transparent",
                      color: muted,
                      border: `1px solid ${border}`,
                      borderRadius: 8,
                      fontFamily: sans,
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    style={{
                      padding: "9px 20px",
                      background: sage,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontFamily: sans,
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: creating ? "default" : "pointer",
                      opacity: creating ? 0.7 : 1,
                    }}
                  >
                    {creating ? "Generating…" : "Generate link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function buildShareUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}
