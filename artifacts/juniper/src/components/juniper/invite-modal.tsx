import { useState, type ReactNode } from "react";
import { invitePartner } from "@/lib/partner";
import { ModalBackdrop } from "@/components/juniper/modal-portal";

// The partnership invite flow. Creates a real invite link via /api/partner.
// Live: mounted from workspace-switcher.tsx's "Invite your partner" action.
//
// Issue #327: signup stayed open for a plain solo account, but joining a
// shared or household space is the higher-stakes surface while Stage 6
// compliance (TOS, privacy policy, security review) is still open, so
// VITE_SIGNUP_INVITE_CODE now gates those two invite types specifically (see
// sign-up.tsx). The invite creator needs to hand that code to whoever they
// invite alongside the link, so it is shown here too, copyable on its own --
// the same code every time, not per-invite, since it is the client-wide
// gate rather than a property of this one invite.
const SIGNUP_CODE = (import.meta.env.VITE_SIGNUP_INVITE_CODE ?? "") as string;

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <ModalBackdrop onClose={onClose}>{children}</ModalBackdrop>;
}

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setBusy(true); setError(null);
    const res = await invitePartner(name);
    setBusy(false);
    if (res.ok && res.url) setUrl(res.url);
    else setError(res.error || "We couldn't generate a live link yet, please try again.");
  };

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* link is still selectable */ }
  };

  const copyCode = async () => {
    if (!SIGNUP_CODE) return;
    try { await navigator.clipboard.writeText(SIGNUP_CODE); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); }
    catch { /* code is still selectable */ }
  };

  return (
    <Backdrop onClose={onClose}>
      <h3>Invite your partner</h3>
      <p>Plan together on shared goals. Only the goals you share become visible to both of you, your accounts, net worth, and spending stay private.</p>
      <div className="field"><label>Partner's first name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Devin" /></div>

      {url && (
        <>
          <div className="share-ok">✓ Link ready, send it to {name.trim() || "your partner"} to connect.</div>
          <div className="share-link"><input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
          {SIGNUP_CODE && (
            <div className="field">
              <label>Invite code (they&rsquo;ll need this too)</label>
              <div className="share-link">
                <input readOnly value={SIGNUP_CODE} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn sm" onClick={copyCode}>{codeCopied ? "Copied" : "Copy"}</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions">
        {!url
          ? <button className="btn" onClick={createLink} disabled={busy}>{busy ? "Creating link…" : "Create invite link"}</button>
          : <button className="btn" onClick={onClose}>Done</button>}
      </div>
      <div className="fine">A shared space opens once your partner accepts and links their own accounts. Nothing of theirs is visible before that.</div>
    </Backdrop>
  );
}
