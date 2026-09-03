// The household entry point (issue #258). Deliberately independent of
// WorkspaceSwitcher/lib/workspace.tsx: that state machine is the live,
// production personal/shared-with-a-partner switch, and a household is a
// third, distinct model (migration 0055), not a generalization of it. This
// renders alongside it rather than inside it, so nothing here can regress the
// partner path.
import { useState } from "react";
import { useLocation } from "wouter";
import { useHousehold } from "@/lib/household";
import { CreateHouseholdModal } from "@/components/juniper/household-invite-modal";

export function HouseholdSwitcher() {
  const [, setLocation] = useLocation();
  const { data, loading, refresh } = useHousehold();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Same rule as WorkspaceSwitcher: nothing renders until the server has
  // answered once, so this can't flash a wrong state.
  if (loading) return null;

  if (!data?.connected) {
    return (
      <>
        <button className="ws-pill" onClick={() => setCreating(true)}>
          <span className="ws-solo" aria-hidden="true">+</span>
          Household
        </button>
        {creating && (
          <CreateHouseholdModal onDone={refresh} onClose={() => setCreating(false)} />
        )}
      </>
    );
  }

  const name = data.household?.name || "Household";

  return (
    <div className="ws-wrap">
      <button
        className="ws-pill on"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ws-duo" aria-hidden="true"><span className="d1" /><span className="d2" /></span>
        {name}
      </button>
      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="pop ws-menu" role="menu">
            <button className="pop-i flat" role="menuitem" onClick={() => { setOpen(false); setLocation("/app/household"); }}>
              Manage household
            </button>
          </div>
        </>
      )}
    </div>
  );
}
