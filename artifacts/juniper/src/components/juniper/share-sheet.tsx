import { useState } from "react";
import { money } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { setAccountShare, type AccountScope, type PartnerAccount } from "@/lib/partner";

// The one place a member decides what the other person can see.
//
// It exists because sharing is private by default (migration 0020). Before that
// the answer was "everything, from the moment they accepted", so there was
// nothing to decide and nowhere to decide it. This supersedes the unrouted
// pages/app/shared/sharing.tsx, which drove a set of coarse toggles off seeded
// data; scope lives per account, which is the grain people actually think in.
//
// Only your own accounts appear. `mine` comes from /api/partner, which decides
// ownership server-side, so the sheet cannot offer to change someone else's.

const SCOPES: { k: AccountScope; label: string; help: string }[] = [
  { k: "private", label: "Private", help: "Hidden entirely. They will not know it exists." },
  { k: "balance", label: "Balance only", help: "They see the total, never the transactions." },
  { k: "shared", label: "Shared", help: "Counts as joint, and both of you see it in full." },
];

const YOU_COLOR = "--jnpr-c3";

function ScopeRow({ a, busy, onPick }: { a: PartnerAccount; busy: boolean; onPick: (s: AccountScope) => void }) {
  return (
    <div className="share-row">
      <div className="tile sm" style={{ background: cssVar(YOU_COLOR) }}>{a.n.charAt(0)}</div>
      <div className="share-id">
        <div className="nm">{a.n}</div>
        <div className="mt">{a.inst} &middot; {a.v < 0 ? <span className="neg">{money(a.v)}</span> : money(a.v)}</div>
      </div>
      <div className="share-scopes" role="group" aria-label={`What ${a.n} shows`}>
        {SCOPES.map((s) => (
          <button
            key={s.k}
            className={a.scope === s.k ? "scope on" : "scope"}
            disabled={busy}
            aria-pressed={a.scope === s.k}
            title={s.help}
            onClick={() => onPick(s.k)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// `accounts` and `onChanged` come from the caller rather than a usePartner() of
// its own. usePartner is a plain hook, not a context, so a second call here
// would hold a second copy of the overview: the sheet would show the new scope
// while the frame behind it kept the old one, so sharing an account never grew
// the nav or retired the canvas.
export function ShareSheet({
  partnerName, accounts, onChanged, onClose,
}: { partnerName: string; accounts: PartnerAccount[]; onChanged: () => void; onClose: () => void }) {
  // Held on an object rather than a bare string: the value is only ever set
  // inside the click handler, and TypeScript narrows a `let x: string | null`
  // assigned only in a callback to `never` at the check below.
  const [busy, setBusy] = useState<{ id: string | null }>({ id: null });

  const mine = accounts.filter((a) => a.mine);

  const pick = (a: PartnerAccount, scope: AccountScope) => {
    if (scope === a.scope) return;
    setBusy({ id: a.account_id });
    void setAccountShare(a.account_id, scope).then(() => {
      onChanged();
      setBusy({ id: null });
    });
  };

  return (
    <ModalBackdrop onClose={onClose} wide>
      <h3>Choose what to share</h3>
      <p>
        {mine.length
          ? `Nothing here reaches ${partnerName} until you say so, and you can take it back at any time.`
          : "Link an account first, and it will show up here to share."}
      </p>

      {mine.length > 0 && (
        <div className="share-list">
          {mine.map((a) => (
            <ScopeRow key={a.account_id} a={a} busy={busy.id === a.account_id} onPick={(s) => pick(a, s)} />
          ))}
        </div>
      )}

      <p className="disc">
        {partnerName} decides the same for their own accounts, so a total you both see counts only
        what each of you has shared.
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </ModalBackdrop>
  );
}
