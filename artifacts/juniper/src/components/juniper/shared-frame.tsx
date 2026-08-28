import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import { InviteModal } from "@/components/juniper/invite-modal";
import { ShareSheet } from "@/components/juniper/share-sheet";
import { useSession } from "@/lib/use-session";
import { Link, useLocation } from "wouter";

// The shell for the shared pages.
//
// Stage 4e: the shared space opens as a near blank canvas and grows only what
// the two of you put on it. Sharing is private by default (migration 0017), so
// a partnership that was just accepted genuinely has nothing in it, and the
// canvas below is the honest first screen rather than an empty-looking table.
//
// The nav is derived from content, not declared: Overview is always there, and
// Accounts appears once either member has shared an account, Goals once a goal
// exists. Bills and Activity are deliberately absent, because their pages still
// read lib/shared-data.ts, and a tab that opens onto a seeded household is the
// thing Stage 4c unrouted them for.
//
// What each remaining page still has to meet to join the nav:
//   1. It reads only /api/partner (and /api/partner/bills, /activity). No
//      lib/shared-data.ts fallback. An active partnership with nothing in it
//      shows an empty state, not a demo one.
//   2. "You" and the partner are named from the session and user_profiles.name.
//      No hardcoded "Maya" or "Devin" on any branch.
//   3. The only thing that can connect a partner is /api/partner reporting an
//      active partnership.
//   4. Migrations 0012, 0013 and 0017 are applied.
//
// pages/app/shared/sharing.tsx is superseded rather than pending: the share
// sheet replaced its coarse toggles with per-account scope, which is the grain
// people think in. It can stay unrouted for good.

// What the shared space can hold. Each kind names the surface it grows, so the
// canvas and the nav cannot disagree about what exists.
type Kind = "accounts" | "goals";

const NAV: Record<Kind, { path: string; label: string }> = {
  accounts: { path: "/app/shared/accounts", label: "Accounts" },
  goals: { path: "/app/shared/goals", label: "Goals" },
};

// The Together band. Carries the share control once there is something to
// weigh it against; on the empty canvas the button below is the only one, so
// putting it here as well would be two calls to the same action on one screen.
function SharedHeader({
  title, sub, name, initial, onShare,
}: { title: string; sub?: string; name: string; initial: string; onShare?: () => void }) {
  return (
    <div className="page-head shared-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="page-actions">
        <span className="duo-ava"><span className="d1">{initial}</span><span className="d2">{name.charAt(0).toUpperCase()}</span></span>
        <span className="plaid-pill"><span className="dot" />Both connected</span>
        {/* Only once there is content to weigh it against. On the empty canvas
            the button below is the single call to action, and a second copy of
            it up here would be two routes to one place on one screen. */}
        {onShare && <button className="btn ghost" onClick={onShare}>Choose what to share</button>}
      </div>
    </div>
  );
}

// The first screen of a shared space with nothing in it. The tiles are the two
// kinds that work end to end today; a tile for a bill or a plan would be an
// offer the product cannot honour yet.
function BlankCanvas({ onShare, onGoal }: { onShare: () => void; onGoal: () => void }) {
  return (
    <div className="card canvas-empty">
      <h2>Just the two of you, so far</h2>
      <p>Add the first thing you want to plan together.</p>
      <div className="canvas-tiles">
        <button className="canvas-tile" onClick={onShare}>
          <span className="g" aria-hidden="true">&#127974;</span>
          An account
          <small>Share a balance, or the whole account</small>
        </button>
        <button className="canvas-tile" onClick={onGoal}>
          <span className="g" aria-hidden="true">&#127919;</span>
          A goal
          <small>Fund it together, each contribution shown</small>
        </button>
      </div>
      <button className="btn" onClick={onShare}>Choose what to share</button>
    </div>
  );
}

export function SharedPage({
  title, sub, children, onAddGoal,
}: { title: string; sub?: string; children: ReactNode; onAddGoal?: () => void }) {
  const { partner } = useWorkspace();
  const { data, loading, refresh } = usePartner();
  const session = useSession();
  const [loc, setLocation] = useLocation();
  const [invite, setInvite] = useState(false);
  const [share, setShare] = useState(false);

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
          <p>
            Invite your partner to open a shared space. It starts empty: nothing of yours is visible
            to them until you choose to share it, and you can take it back at any time.
          </p>
          <button className="btn" onClick={() => setInvite(true)}>Invite your partner</button>
        </div>
        {invite && <InviteModal onClose={() => setInvite(false)} />}
      </div>
    );
  }

  // What the space actually holds. A shared account is one either member has
  // moved off `private`; the scope is decided server-side, so a private account
  // never reaches the client to be counted here in the first place.
  const holds: Record<Kind, boolean> = {
    accounts: (data?.accounts ?? []).some((a) => a.scope !== "private"),
    goals: (data?.goals ?? []).length > 0,
  };
  const grown = (Object.keys(NAV) as Kind[]).filter((k) => holds[k]);
  const empty = grown.length === 0;

  return (
    <div className="frame">
      <SharedHeader
        title={empty ? "Together" : title}
        sub={empty ? `Nothing of yours is visible to ${name} until you share it.` : sub}
        name={name}
        initial={initial}
        onShare={empty ? undefined : () => setShare(true)}
      />

      {grown.length > 0 && (
        <nav className="nav shared-nav" aria-label="Shared">
          <Link href="/app/shared" className={loc === "/app/shared" ? "on" : undefined}>
            <span className="lbl">Overview</span>
          </Link>
          {grown.map((k) => (
            <Link key={k} href={NAV[k].path} className={loc === NAV[k].path ? "on" : undefined}>
              <span className="lbl">{NAV[k].label}</span>
            </Link>
          ))}
        </nav>
      )}

      {/* `loading` matters here: usePartner starts at null, and without this the
          canvas flashes on every navigation before the overview lands. */}
      {empty && !loading ? (
        <BlankCanvas
          onShare={() => setShare(true)}
          onGoal={() => (onAddGoal ? onAddGoal() : setLocation("/app/shared/goals"))}
        />
      ) : (
        children
      )}

      {share && (
        <ShareSheet
          partnerName={name}
          accounts={data?.accounts ?? []}
          onChanged={refresh}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}
