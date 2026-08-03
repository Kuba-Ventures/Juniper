import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { createInvite } from "@/lib/invites";
import { useWorkspace } from "@/lib/workspace";

// The invite flow reachable from the account menu (and Plans). Generates a real
// shareable link via the domain-scoped createInvite; and, because the shared
// experience runs on mock data for now, offers a clearly-labeled "preview the
// shared space" shortcut that connects the demo partner so you can walk through it.
const INVITE_DOMAIN = "combining-finances";

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  const { connect, setWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setBusy(true); setError(null);
    const res = await createInvite(INVITE_DOMAIN, name.trim() || undefined);
    setBusy(false);
    if (res?.url) setUrl(res.url);
    else setError("We couldn't generate a live link yet — you can still preview the shared space below.");
  };

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* link is still selectable */ }
  };

  const preview = () => {
    connect(name.trim() || undefined);
    setWorkspace("shared");
    onClose();
    setLocation("/app/shared");
  };

  return (
    <Backdrop onClose={onClose}>
      <h3>Invite your partner</h3>
      <p>Plan together on shared goals. Only the goals you share become visible to both of you — your accounts, net worth, and spending stay private.</p>
      <div className="field"><label>Partner's first name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Devin" /></div>

      {url && (
        <div className="share-link"><input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions">
        {!url
          ? <button className="btn" onClick={createLink} disabled={busy}>{busy ? "Creating link…" : "Create invite link"}</button>
          : <button className="btn ghost" onClick={onClose}>Done</button>}
        <button className="btn ghost" onClick={preview}>Preview shared space →</button>
      </div>
      <div className="fine">The shared space is a live preview on demo data. Real partner data connects once they accept and link their accounts.</div>
    </Backdrop>
  );
}
