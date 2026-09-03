import { useState, type ReactNode } from "react";
import { createHousehold, inviteToHousehold, type HouseholdRole } from "@/lib/household";
import { ModalBackdrop } from "@/components/juniper/modal-portal";

// Two jobs, one modal, chosen by whether the caller already has a household:
// name a household into existence, or invite the next member into the one
// that already exists. Modeled on invite-modal.tsx's create-link flow.
function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <ModalBackdrop onClose={onClose}>{children}</ModalBackdrop>;
}

export function CreateHouseholdModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Give your household a name."); return; }
    setBusy(true); setError(null);
    const res = await createHousehold(trimmed);
    setBusy(false);
    if (res.ok) { onDone(); onClose(); }
    else setError(res.error || "We couldn't create that yet, please try again.");
  };

  return (
    <Backdrop onClose={onClose}>
      <h3>Start a household</h3>
      <p>A shared space for more than one person, parents and kids or any group. Nothing of yours is visible to anyone until you choose it, account by account.</p>
      <div className="field"><label>Household name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Barretts" /></div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create household"}</button>
      </div>
    </Backdrop>
  );
}

export function InviteHouseholdModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<HouseholdRole>("adult");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setBusy(true); setError(null);
    const res = await inviteToHousehold({ name: name.trim() || undefined, role: role === "teen" ? "teen" : "adult" });
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
      <h3>Invite to your household</h3>
      <p>Only what they choose to share becomes visible to the household. Their accounts, net worth, and spending stay private until then.</p>
      <div className="field"><label>Their first name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan" /></div>
      <div className="field">
        <label>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as HouseholdRole)}>
          <option value="adult">Adult, full member</option>
          <option value="teen">Teen, can view and share, can't invite or remove anyone</option>
        </select>
      </div>

      {url && (
        <>
          <div className="share-ok">✓ Link ready, send it to {name.trim() || "them"} to join.</div>
          <div className="share-link"><input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
        </>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions">
        {!url
          ? <button className="btn" onClick={createLink} disabled={busy}>{busy ? "Creating link…" : "Create invite link"}</button>
          : <button className="btn" onClick={onClose}>Done</button>}
      </div>
    </Backdrop>
  );
}
