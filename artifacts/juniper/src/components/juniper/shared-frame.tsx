import { useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { usePartner } from "@/lib/partner";
import { InviteModal } from "@/components/juniper/invite-modal";
import { ShareSheet } from "@/components/juniper/share-sheet";
import { useSession } from "@/lib/use-session";
import { useLocation } from "wouter";

// The shell for the shared pages.
//
// Stage 4e: the shared space opens as a near blank canvas and grows only what
// the two of you put on it. Sharing is private by default (migration 0020), so
// a partnership that was just accepted genuinely has nothing in it, and the
// canvas below is the honest first screen rather than an empty-looking table.
//
// The nav is derived from content, not declared: Overview is always there, and
// each of Accounts, Goals, Bills and Activity appears once the space holds one
// of that kind. Stage 4f de-seeded the last two, so all five of the six shared
// pages that a member can reach now read live data only. sharing.tsx is the
// sixth and stays retired, superseded by the share sheet.
//
// What each remaining page still has to meet to join the nav:
//   1. It reads only /api/partner (and /api/partner/bills, /activity). No
//      lib/shared-data.ts fallback. An active partnership with nothing in it
//      shows an empty state, not a demo one.
//   2. "You" and the partner are named from the session and user_profiles.name.
//      No hardcoded "Maya" or "Devin" on any branch.
//   3. The only thing that can connect a partner is /api/partner reporting an
//      active partnership.
//   4. Migrations 0012, 0013 and 0020 are applied.
//
// pages/app/shared/sharing.tsx is superseded rather than pending: the share
// sheet replaced its coarse toggles with per-account scope, which is the grain
// people think in. It can stay unrouted for good.

// What the shared space can hold. Each kind names the surface it grows, so the
// canvas and the nav cannot disagree about what exists.
type Kind = "accounts" | "goals" | "bills" | "activity";

// The tabs themselves live in the app bar now (app-frame.tsx, sharedNav),
// because switching space switches the whole product rather than adding a
// second nav under a personal one. This keeps only the set of kinds the canvas
// has to reason about.
const KINDS: Kind[] = ["accounts", "goals", "bills", "activity"];

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

// The first screen of a shared space with nothing in it. One tile per kind the
// space can hold, and each one is the only way to reach that surface before it
// has anything: the app bar grows a tab off content, so without these a member
// could not add the first bill because the Bills tab does not exist until a
// bill does.
function BlankCanvas({ onShare, onGoal, onBill, onMessage }: {
  onShare: () => void; onGoal: () => void; onBill: () => void; onMessage: () => void;
}) {
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
        <button className="canvas-tile" onClick={onBill}>
          <span className="g" aria-hidden="true">&#129534;</span>
          A bill
          <small>Who pays what, and when it is due</small>
        </button>
        <button className="canvas-tile" onClick={onMessage}>
          <span className="g" aria-hidden="true">&#128172;</span>
          A message
          <small>A thread only the two of you can see</small>
        </button>
      </div>
      <button className="btn" onClick={onShare}>Choose what to share</button>
    </div>
  );
}

export function SharedPage({
  title, sub, children, onAddGoal,
}: { title: string; sub?: string; children: ReactNode; onAddGoal?: () => void }) {
  const { partner, holds, refresh: refreshWorkspace } = useWorkspace();
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

  // `holds` comes from the workspace context, the same value the app bar builds
  // its tabs from, so the band, the canvas and the nav cannot disagree about
  // whether the space has anything in it.
  const grown = KINDS.filter((k) => holds[k]);
  const empty = grown.length === 0;
  const isOverview = loc === "/app/shared";

  return (
    <div className="frame">
      <SharedHeader
        title={empty ? "Together" : title}
        sub={empty ? `Nothing of yours is visible to ${name} until you share it.` : sub}
        name={name}
        initial={initial}
        onShare={empty ? undefined : () => setShare(true)}
      />

      {/* The canvas belongs to the shared Overview and nowhere else. It used to
          replace the children of EVERY shared page while the space was empty,
          which made the sub-pages unreachable at exactly the moment they were
          needed: a member following the "A bill" tile landed on Bills and was
          shown the canvas again. Each sub-page has its own empty state now, and
          says the honest thing for its own kind.

          `loading` still matters: usePartner starts at null, and without it the
          canvas flashes on every navigation before the overview lands. */}
      {empty && isOverview && !loading ? (
        <BlankCanvas
          onShare={() => setShare(true)}
          onGoal={() => (onAddGoal ? onAddGoal() : setLocation("/app/shared/goals"))}
          onBill={() => setLocation("/app/shared/bills")}
          onMessage={() => setLocation("/app/shared/activity")}
        />
      ) : (
        children
      )}

      {share && (
        <ShareSheet
          partnerName={name}
          accounts={data?.accounts ?? []}
          // Both, deliberately: usePartner backs this page's rows, the workspace
          // context backs the app bar's tabs. Refreshing one alone leaves the
          // other stale, and sharing the first account would not grow the nav.
          onChanged={() => { refresh(); refreshWorkspace(); }}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}
