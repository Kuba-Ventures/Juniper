// The household page (issue #258): members, roles, per-account sharing, and
// the combined total. Reached from HouseholdSwitcher, not from the personal
// nav array, the same way Settings is reached from the account menu rather
// than from a tab.
//
// Deliberately its own page rather than folded into the shared partner
// workspace (components/juniper/shared-frame.tsx): a household is a distinct
// model (migration 0055), and reusing that frame would couple this to
// lib/workspace.tsx, which this feature does not touch.
import { useState } from "react";
import { useLocation } from "wouter";
import { money } from "@/lib/mock-data";
import { cssVar } from "@/components/juniper/primitives";
import { PageHeader } from "@/components/juniper/app-frame";
import {
  useHousehold, isShared, leaveHousehold, removeHouseholdMember, setHouseholdAccountShare,
  type HouseholdAccount, type HouseholdRole, type AccountScope,
} from "@/lib/household";
import { InviteHouseholdModal } from "@/components/juniper/household-invite-modal";

const roleLabel: Record<HouseholdRole, string> = { owner: "Owner", adult: "Adult", teen: "Teen" };
const MEMBER_COLORS = ["--jnpr-c3", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c1", "--jnpr-c7"];

function AccountRow({ a, canToggle, onToggle, busy }: {
  a: HouseholdAccount; canToggle: boolean; onToggle: (next: AccountScope) => void; busy: boolean;
}) {
  const on = isShared(a.scope);
  const hidden = a.scope === "private" && !a.mine;
  return (
    <div className="share-row">
      <div className="tile sm" style={{ background: cssVar("--jnpr-c4") }}>{a.n.charAt(0)}</div>
      <div className="share-id">
        <div className="nm">{a.n}</div>
        <div className="mt">{a.inst}</div>
      </div>
      <div className="amt">
        {hidden ? <span style={{ color: "var(--jnpr-ink-3)" }}>••••</span> : <span className={a.v < 0 ? "neg tnum" : "tnum"}>{money(a.v)}</span>}
      </div>
      {canToggle ? (
        <button
          className={on ? "share-toggle on" : "share-toggle"}
          role="switch"
          aria-checked={on}
          aria-label={`Share ${a.n} with the household`}
          disabled={busy}
          onClick={() => onToggle(on ? "private" : "shared")}
        >
          <i />
        </button>
      ) : (
        <span className={`chip ${a.scope}`}>{on ? "Shared" : "Private"}</span>
      )}
    </div>
  );
}

export function HouseholdView() {
  const [, setLocation] = useLocation();
  const { data, loading, refresh } = useHousehold();
  const [inviting, setInviting] = useState(false);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="frame">
        <PageHeader title="Household" />
        <p className="sub">Loading your household…</p>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="frame">
        <PageHeader title="Household" sub="A shared space for more than one person — parents and kids, or any group." />
        <div className="card pad-lg">
          <p>You're not in a household yet. Use the Household control in the top bar to start one.</p>
        </div>
      </div>
    );
  }

  const isOwner = data.role === "owner";
  const accounts = data.accounts ?? [];
  const members = data.members ?? [];

  const toggle = (a: HouseholdAccount, next: AccountScope) => {
    setBusyAccount(a.account_id);
    void setHouseholdAccountShare(a.account_id, next).then(() => { refresh(); setBusyAccount(null); });
  };

  const remove = (userId: string) => {
    setBusyAction(true); setError(null);
    void removeHouseholdMember(userId).then((res) => {
      setBusyAction(false);
      if (res.ok) refresh(); else setError(res.error || "Couldn't remove that member.");
    });
  };

  const leave = () => {
    setBusyAction(true); setError(null);
    void leaveHousehold().then((res) => {
      setBusyAction(false);
      if (res.ok) setLocation("/app");
      else setError(res.error || "Couldn't leave the household.");
    });
  };

  return (
    <div className="frame">
      <PageHeader
        title={data.household?.name || "Household"}
        sub="Nothing here is visible to anyone until you choose it, account by account. Transactions are never shared."
        actions={isOwner ? <button className="btn" onClick={() => setInviting(true)}>Invite a member</button> : undefined}
      />

      <div className="card pad-lg together" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Together</div>
        <div className="big-num tnum" style={{ margin: "6px 0 2px" }}>{money(data.combined?.netWorth ?? 0)}</div>
        <p className="sub" style={{ margin: "6px 0 0" }}>What the household has chosen to share, summed across everyone.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Members</h3></div>
        <div className="rows">
          {members.map((m, i) => (
            <div className="share-row" key={m.userId}>
              <div className="tile sm" style={{ background: cssVar(MEMBER_COLORS[i % MEMBER_COLORS.length]) }}>{m.name.charAt(0).toUpperCase()}</div>
              <div className="share-id">
                <div className="nm">{m.name}{m.isMe ? " (you)" : ""}</div>
                <div className="mt">{roleLabel[m.role]}</div>
              </div>
              {isOwner && !m.isMe && (
                <button className="btn ghost sm" disabled={busyAction} onClick={() => remove(m.userId)}>Remove</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Choose what to share</h3></div>
        {accounts.filter((a) => a.mine).length === 0 ? (
          <p className="sub">Link an account first, and it will show up here to share.</p>
        ) : (
          <div className="share-list">
            {accounts.filter((a) => a.mine).map((a) => (
              <AccountRow key={a.account_id} a={a} canToggle busy={busyAccount === a.account_id} onToggle={(next) => toggle(a, next)} />
            ))}
          </div>
        )}
        {accounts.some((a) => !a.mine) && (
          <>
            <div className="card-head" style={{ marginTop: 16 }}><h3>Shared by others</h3></div>
            <div className="share-list">
              {accounts.filter((a) => !a.mine).map((a) => (
                <AccountRow key={`${a.owner_id}:${a.account_id}`} a={a} canToggle={false} busy={false} onToggle={() => {}} />
              ))}
            </div>
          </>
        )}
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <button className="btn ghost" onClick={leave} disabled={busyAction}>Leave household</button>

      {inviting && <InviteHouseholdModal onClose={() => { setInviting(false); refresh(); }} />}
    </div>
  );
}
