import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import { InviteModal } from "@/components/juniper/invite-modal";
import { you, partner as demoPartner } from "@/lib/shared-data";

// UNROUTED as of Stage 4c, along with every page that wraps itself in SharedPage
// (src/pages/app/shared/*.tsx). This is the shell for all six of them, so the
// reasoning lives here rather than repeated six times.
//
// Why it is unreachable: the workspace could not honor the rule that only the
// member's own real data may appear in the app. All six pages fall back to
// lib/shared-data.ts, which is a seeded household, and goals.tsx has no live
// branch at all. The signed-in member is named "Maya" and the partner "Devin",
// including on the live branch (`you.initial` in the header band below, and the
// SharedAccount `inst` labels). The gate was `partner.connected`, client-only
// localStorage state a "Preview shared space" button flipped with no server
// partnership behind it, so any signed-in member could walk into a stranger's
// invented finances.
//
// What has to be true to route these again:
//   1. Every page reads only /api/partner (and /api/partner/bills, /activity).
//      No lib/shared-data.ts fallback anywhere, goals.tsx included. An active
//      partnership with nothing in it shows an empty state, not a demo one.
//   2. "You" and the partner are named from the session and user_profiles.name.
//      No hardcoded "Maya" or "Devin" on any branch.
//   3. The only thing that can connect a partner is /api/partner reporting an
//      active partnership. No client-only flip, no preview mode.
//   4. Migrations 0012 and 0013 are applied, so the endpoints have tables to
//      read, and the accept flow lands somewhere a member can see.
//
// Kept, not deleted: the pages, this shell, lib/shared-data.ts (Stage 4d tears
// the seeds down), and all the api/partner* endpoints and tables.

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
          <p>Invite your partner to open a shared space, combined net worth, shared goals, bills, and a private what-you-share panel. Your own accounts stay private.</p>
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
