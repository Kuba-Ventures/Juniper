import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { InviteModal } from "@/components/juniper/invite-modal";
import { you, partner as demoPartner } from "@/lib/shared-data";

// Couple header band for every shared sub-page.
function SharedHeader({ title, sub, name }: { title: string; sub?: string; name: string }) {
  return (
    <div className="page-head shared-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="page-actions">
        <span className="duo-ava"><span className="d1">{you.initial}</span><span className="d2">{name.charAt(0).toUpperCase()}</span></span>
        <span className="plaid-pill"><span className="dot" />Both connected</span>
      </div>
    </div>
  );
}

// Wraps a shared page: guards on partner-connected, renders the couple header.
export function SharedPage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { partner } = useWorkspace();
  const [invite, setInvite] = useState(false);
  const name = partner.name || demoPartner.name;

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
      <SharedHeader title={title} sub={sub} name={name} />
      {children}
    </div>
  );
}
