// The space switcher: whose money you are looking at.
//
// It appears for everyone, not only members with a partner, because it is also
// the only way to invite one. With nobody connected it reads "Just you" and
// offers the invite; it never lists a shared space that does not exist, which
// was the failure of the version removed in Stage 4c.
import { useState } from "react";
import { useLocation } from "wouter";
import { useWorkspace } from "@/lib/workspace";
import { InviteModal } from "@/components/juniper/invite-modal";

function Caret() {
  return (
    <svg className="caret" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function WorkspaceSwitcher({ initial }: { initial: string }) {
  const [, setLocation] = useLocation();
  const { workspace, setWorkspace, partner, ready, refresh } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Nothing is drawn until the server has answered once. A pill that says "Just
  // you" and then changes its mind a moment later is worse than a beat of
  // nothing, because the first answer is the one people read.
  if (!ready) return null;

  const shared = workspace === "shared";
  const partnerName = partner.name || "your partner";

  const go = (w: "personal" | "shared") => {
    setOpen(false);
    setWorkspace(w);
    // The two spaces have different routes, so switching has to move as well as
    // set state, otherwise the pill changes and the page under it does not.
    setLocation(w === "shared" ? "/app/shared" : "/app");
  };

  return (
    <div className="ws-wrap">
      <button
        className={shared ? "ws-pill on" : "ws-pill"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {shared ? (
          <span className="ws-duo" aria-hidden="true"><span className="d1" /><span className="d2" /></span>
        ) : (
          <span className="ws-solo" aria-hidden="true">{initial}</span>
        )}
        {shared ? `Shared with ${partnerName}` : "Just you"}
        <Caret />
      </button>

      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="pop ws-menu" role="menu">
            <button className="pop-i flat" role="menuitem" onClick={() => go("personal")}>
              <span className="ws-solo" aria-hidden="true">{initial}</span> Just you
            </button>
            {partner.connected && (
              <button className="pop-i flat" role="menuitem" onClick={() => go("shared")}>
                <span className="ws-duo" aria-hidden="true"><span className="d1" /><span className="d2" /></span>{" "}
                Shared with {partnerName}
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
    </div>
  );
}
