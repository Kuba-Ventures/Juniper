import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import { InviteModal } from "@/components/juniper/invite-modal";
import { you, partner as demoPartner } from "@/lib/shared-data";

// Couple header band for every shared sub-page. `live` distinguishes a real,
// accepted partnership (both accounts linked) from the demo preview, so the
// status pill tells the truth instead of always claiming "Both connected".
function SharedHeader({ title, sub, name, live }: { title: string; sub?: string; name: string; live: boolean }) {
  return (
    <div className="page-head shared-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="page-actions">
        <span className="duo-ava"><span className="d1">{you.initial}</span><span className="d2">{name.charAt(0).toUpperCase()}</span></span>
        {live
          ? <span className="plaid-pill"><span className="dot" />Both connected</span>
          : <span className="plaid-pill demo">Preview · demo data</span>}
      </div>
    </div>
  );
}

// Wraps a shared page: guards on partner-connected, renders the couple header.
export function SharedPage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { partner } = useWorkspace();
  const { data } = usePartner();
  const [invite, setInvite] = useState(false);
  const name = partner.name || demoPartner.name;
  const live = !!data?.connected;

  if (!partner.connected) {
    return (
      <div className="frame">
        <div className="card connect-empty">
          <div className="ce-mark">♡</div>
          <h2>Plan together</h2>
          <p>Invite your partner to open a shared space — combined net worth, shared goals, bills, and a private what-you-share panel. Your own accounts stay private.</p>
          <button className="btn" onClick={() => setInvite(true)}>Invite your partner</button>
        </div>
        {invite && <InviteModal onClose={() => setInvite(false)} />}
      </div>
    );
  }

  return (
    <div className="frame">
      <SharedHeader title={title} sub={sub} name={name} live={live} />
      {children}
    </div>
  );
}
