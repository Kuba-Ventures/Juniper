// The space switcher: whose money you are looking at.
//
// It appears for everyone, not only members with a partner or a household,
// because it is also the only way to invite one or start the other. With
// nobody connected it reads "Just you" and offers both; it never lists a
// shared space that does not exist, which was the failure of the version
// removed in Stage 4c.
//
// One list, three peer rows (issue #258, option A of three live-rendered
// treatments in previews/household-switcher-options.html): "Just you",
// "Shared with <partner>" and the household's name all read the same way and
// switch the same way, because from here they ARE the same kind of thing,
// a workspace. What is NOT the same, and stays separate underneath, is
// lib/workspace.tsx's two independent server answers (/api/partner and
// /api/household) — this file is the one place they are merged into a single
// list, not a second data model.
import { useState } from "react";
import { useLocation } from "wouter";
import { useWorkspace, type Workspace } from "@/lib/workspace";
import { InviteModal } from "@/components/juniper/invite-modal";
import { CreateHouseholdModal } from "@/components/juniper/household-invite-modal";

function Caret() {
  return (
    <svg className="caret" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function WorkspaceSwitcher({ initial }: { initial: string }) {
  const [, setLocation] = useLocation();
  const { workspace, setWorkspace, partner, household, ready, refresh } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [creatingHousehold, setCreatingHousehold] = useState(false);

  // Nothing is drawn until the server has answered once. A pill that says "Just
  // you" and then changes its mind a moment later is worse than a beat of
  // nothing, because the first answer is the one people read.
  if (!ready) return null;

  const partnerName = partner.name || "your partner";
  const householdName = household.name || "Household";

  const routeFor: Record<Workspace, string> = { personal: "/app", shared: "/app/shared", household: "/app/household" };
  const go = (w: Workspace) => {
    setOpen(false);
    setWorkspace(w);
    // The spaces have different routes, so switching has to move as well as
    // set state, otherwise the pill changes and the page under it does not.
    setLocation(routeFor[w]);
  };

  const on = workspace !== "personal";
  const label = workspace === "shared" ? `Shared with ${partnerName}` : workspace === "household" ? householdName : "Just you";

  return (
    <div className="ws-wrap">
      <button
        className={on ? "ws-pill on" : "ws-pill"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {workspace === "shared" ? (
          <span className="ws-duo" aria-hidden="true"><span className="d1" /><span className="d2" /></span>
        ) : workspace === "household" ? (
          <span className="ws-hh" aria-hidden="true">{householdName.charAt(0).toUpperCase()}</span>
        ) : (
          <span className="ws-solo" aria-hidden="true">{initial}</span>
        )}
        {label}
        <Caret />
      </button>

      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="pop ws-menu" role="menu">
            <button className={workspace === "personal" ? "pop-i flat on" : "pop-i flat"} role="menuitem" onClick={() => go("personal")}>
              <span className="ws-solo" aria-hidden="true">{initial}</span> Just you
            </button>
            {partner.connected && (
              <button className={workspace === "shared" ? "pop-i flat on" : "pop-i flat"} role="menuitem" onClick={() => go("shared")}>
                <span className="ws-duo" aria-hidden="true"><span className="d1" /><span className="d2" /></span>{" "}
                Shared with {partnerName}
              </button>
            )}
            {household.connected && (
              <button className={workspace === "household" ? "pop-i flat on" : "pop-i flat"} role="menuitem" onClick={() => go("household")}>
                <span className="ws-hh" aria-hidden="true">{householdName.charAt(0).toUpperCase()}</span> {householdName}
              </button>
            )}
            <div className="pop-sep" />
            {partner.connected ? (
              <button className="pop-i flat" role="menuitem" onClick={() => { setOpen(false); setLocation("/app/shared"); }}>
                Manage sharing
              </button>
            ) : (
              <button className="pop-i flat" role="menuitem" onClick={() => { setOpen(false); setInviting(true); }}>
                Invite your partner
              </button>
            )}
            {household.connected ? (
              <button className="pop-i flat" role="menuitem" onClick={() => { setOpen(false); setLocation("/app/household"); }}>
                Manage household
              </button>
            ) : (
              <button className="pop-i flat" role="menuitem" onClick={() => { setOpen(false); setCreatingHousehold(true); }}>
                Start a household
              </button>
            )}
          </div>
        </>
      )}

      {inviting && (
        <InviteModal
          onClose={() => {
            setInviting(false);
            // An invite that was accepted while this was open should not need a
            // reload to show up.
            refresh();
          }}
        />
      )}
      {creatingHousehold && (
        <CreateHouseholdModal
          onDone={refresh}
          onClose={() => setCreatingHousehold(false)}
        />
      )}
    </div>
  );
}
