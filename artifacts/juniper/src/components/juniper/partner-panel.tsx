import { useState, type ReactNode } from "react";
import { createInvite } from "@/lib/invites";

// UNMOUNTED as of Stage 4c. The Plans page was the only place this rendered.
// Accepting one of its invites led nowhere a member could see: the link is
// /invite/:token, and invite-landing.tsx sends an accepter to
// /app/plans/:domain, a route only the retired app-shell.tsx ever defined. On
// the inviter's side, plans.tsx rendered this with no `partnerName`, so it could
// never show the connected state either. The backend half is untouched and
// works: POST /api/invites writes invite_token + partner_invite_status on the
// plans row, and accept_plan_invite records the partner. What is missing is a
// reachable surface, a plan-detail route rendering the partner's answers and the
// alignment view. Restore this panel when that exists, not before.
//
// The partner layer (Stage 7). Juniper is solo-first; this is the OPTIONAL layer
// that lets a member invite a partner to share goals. Individual accounts, net
// worth, and spending stay private, only shared goals become visible to both.
//
// Reuses the existing domain-scoped invite backend (createInvite). The couples
// surface maps to the "combining-finances" domain. When the backend has no
// backing plan for that domain yet, createInvite returns null and we degrade to
// a friendly "not ready" message rather than a dead end.
const INVITE_DOMAIN = "combining-finances";

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-6.5-4.2-9-8.2A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 5.8c-2.5 4-9 8.2-9 8.2z" />
  </svg>
);

function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await createInvite(INVITE_DOMAIN, name.trim() || undefined);
    setBusy(false);
    if (res?.url) setUrl(res.url);
    else setError("Partner invites aren’t ready yet, set up a shared goal first, then try again.");
  };

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* clipboard blocked, the link is still selectable */ }
  };

  if (url) {
    return (
      <Backdrop onClose={onClose}>
        <h3>Invite {name.trim() || "your partner"}</h3>
        <p>Share this private link. When {name.trim() || "they"} open it, they can join your shared goals, your individual accounts stay private.</p>
        <div className="share-link">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <h3>Invite your partner</h3>
      <p>Plan together on shared goals. Only the goals you share become visible to both of you, your accounts, net worth, and spending stay private.</p>
      <div className="field"><label>Partner’s first name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Devin" /></div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={create} disabled={busy}>{busy ? "Creating link…" : "Create invite link"}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Backdrop>
  );
}

// Compact solo-default panel. `partnerName` (once accepted) flips it to the
// connected state; until then it's the invite CTA.
export function PartnerPanel({ partnerName }: { partnerName?: string | null }) {
  const [open, setOpen] = useState(false);
  const connected = !!partnerName;
  return (
    <>
      <div className="partner-panel">
        <div className="pp-mark"><HeartIcon /></div>
        <div className="pp-body">
          <div className="pp-title">{connected ? `Planning with ${partnerName}` : "Planning with a partner?"}</div>
          <div className="pp-sub">
            {connected
              ? "You're sharing goals. Individual accounts stay private to each of you."
              : "Invite them to share goals together, your accounts and net worth stay private."}
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen(true)}>{connected ? "Manage" : "Invite partner"}</button>
      </div>
      {open && <InviteModal onClose={() => setOpen(false)} />}
    </>
  );
}
