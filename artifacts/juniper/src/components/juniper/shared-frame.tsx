import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import { InviteModal } from "@/components/juniper/invite-modal";
import { useSession } from "@/lib/use-session";
import { Link, useLocation } from "wouter";

// The shell for the shared pages. Two of the six are routed again as of Stage
// 4d, Overview and Goals; Accounts, Bills, Activity and Sharing are not, and the
// conditions below are what each of them still has to meet.
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
// What has to be true to route the remaining four (Overview and Goals now meet
// all four):
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
function SharedHeader({ title, sub, name, initial }: { title: string; sub?: string; name: string; initial: string }) {
  return (
    <div className="page-head shared-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="page-actions">
        <span className="duo-ava"><span className="d1">{initial}</span><span className="d2">{name.charAt(0).toUpperCase()}</span></span>
        {/* One state now, because there is only one: a partnership the server
            reported. The "Preview · demo data" pill went with the seeded
            household it used to label. */}
        <span className="plaid-pill"><span className="dot" />Both connected</span>
      </div>
    </div>
  );
}

// The two shared surfaces that are routed. Kept here so neither page repeats it.
const SHARED_NAV = [
  { path: "/app/shared", label: "Overview" },
  { path: "/app/shared/goals", label: "Goals" },
];

// Wraps a shared page: guards on partner-connected, renders the couple header.
export function SharedPage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { partner } = useWorkspace();
  const { data } = usePartner();
  const session = useSession();
  const [loc] = useLocation();
  const [invite, setInvite] = useState(false);

  const meName =
    (session?.user.user_metadata as { name?: string } | undefined)?.name || session?.user.email || "";
  const initial = meName.trim().charAt(0).toUpperCase() || "Y";
  const name = partner.name || data?.partner?.name || "your partner";

  if (!partner.connected) {
    return (
      <div className="frame">
        <div className="card connect-empty">
          <div className="ce-mark">&#9825;</div>
          <h2>Plan together</h2>
          {/* Promises exactly the two surfaces that exist. It used to offer
              bills and a sharing panel as well, which are still unrouted. */}
          <p>
            Invite your partner to open a shared space: your combined net worth, and goals you fund
            together with each person's contribution shown. Your own accounts stay private unless you
            share them.
          </p>
          <button className="btn" onClick={() => setInvite(true)}>Invite your partner</button>
        </div>
        {invite && <InviteModal onClose={() => setInvite(false)} />}
      </div>
    );
  }

  return (
    <div className="frame">
      <SharedHeader title={title} sub={sub} name={name} initial={initial} />
      <nav className="nav shared-nav" aria-label="Shared">
        {SHARED_NAV.map((n) => (
          <Link key={n.path} href={n.path} className={loc === n.path ? "on" : undefined}>
            <span className="lbl">{n.label}</span>
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
