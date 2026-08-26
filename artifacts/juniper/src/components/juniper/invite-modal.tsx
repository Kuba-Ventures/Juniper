import { useState, type ReactNode } from "react";
import { invitePartner } from "@/lib/partner";
import { ModalBackdrop } from "@/components/juniper/modal-portal";

// The partnership invite flow. Creates a real invite link via /api/partner.
//
// Stage 4c: nothing reachable mounts this any more. The account menu no longer
// offers it, because the only thing an accepted invite led to was /app/shared,
// which is unrouted while its pages still render a seeded household. The
// "Preview shared space" button is gone too: it called the workspace context's
// connect() to flip partner.connected in localStorage, with no server
// partnership behind it, and dropped the member into the demo couple's data. If
// the workspace comes back, this modal should offer the link and nothing else,
// and the member should only see a shared space once /api/partner says the
// partnership is active.

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <ModalBackdrop onClose={onClose}>{children}</ModalBackdrop>;
}

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setBusy(true); setError(null);
    const res = await invitePartner();
    setBusy(false);
    if (res.ok && res.url) setUrl(res.url);
    else setError(res.error || "We couldn't generate a live link yet, please try again.");
  };

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* link is still selectable */ }
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
