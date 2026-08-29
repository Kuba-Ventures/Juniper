// Workspace context (Stage 7 partner layer, front-end).
//
// Juniper is individual-first. A member can optionally connect a partner; once
// connected, a second "workspace" appears and the app can switch between the
// member's private finances and the shared view. This holds that state (which
// workspace is active + whether a partner is connected), persisted to
// localStorage so it survives navigation.
//
// Stage 4d: mounted again, for the two shared surfaces that can show real data
// (Overview and Goals). The rule the Stage 4c teardown left behind is kept and
// is now the only rule here: /api/partner is the ONLY thing that can report a
// partner. There is no connect() and no preview, because the previous version
// flipped `partner.connected` from the client alone, on a "Preview shared space"
// button with no server partnership behind it, which is how a member could end
// up looking at a stranger's invented finances.
//
// What persists locally is which space you were last looking at, and nothing
// else. The partner's existence and name are re-read from the server on every
// load, so a partnership that ended elsewhere cannot survive in a stale cache.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { fetchPartner } from "@/lib/partner";

export type Workspace = "personal" | "shared";

export interface PartnerState {
  name: string;
  connected: boolean;
}

// What the shared space actually holds. The top bar's shared tabs are derived
// from this rather than declared, so a tab never appears over an empty surface.
// It lives on the context, not in a usePartner() of its own, because the app bar
// and the shared page both need it and usePartner is a plain hook: two calls
// would hold two copies, and sharing an account would grow one nav and not the
// other.
export interface SharedHolds {
  accounts: boolean;
  goals: boolean;
  bills: boolean;
  activity: boolean;
}

interface WorkspaceCtx {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  partner: PartnerState;
  holds: SharedHolds;
  // False until /api/partner has answered once, so the switcher can stay quiet
  // rather than flashing "Just you" at somebody who has a partner.
  ready: boolean;
  refresh: () => void;
}

const KEY = "jnpr.workspace.v1";

// Only the view preference is remembered. A cached partner would be a claim
// about somebody else's account, made by this browser, with nothing behind it.
function loadWorkspace(): Workspace {
  try {
    return localStorage.getItem(KEY) === "shared" ? "shared" : "personal";
  } catch {
    return "personal";
  }
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(loadWorkspace);
  const [partner, setPartner] = useState<PartnerState>({ name: "", connected: false });
  const [holds, setHolds] = useState<SharedHolds>({ accounts: false, goals: false, bills: false, activity: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, workspace); } catch { /* ignore */ }
  }, [workspace]);

  // The route is also a way in. An accepted invite lands on /app/shared, and a
  // member can type or bookmark it, so the switcher has to agree with the page
  // underneath it rather than still reading "Just you" on the shared overview.
  const [loc] = useLocation();
  useEffect(() => {
    if (loc.startsWith("/app/shared") && partner.connected) setWorkspaceState("shared");
  }, [loc, partner.connected]);

  // The whole truth about whether a partner exists, re-read on every load.
  // A failed read leaves `connected` false, which hides the shared space rather
  // than showing it without data behind it.
  const sync = useCallback(() => {
    let alive = true;
    void fetchPartner().then((d) => {
      if (!alive) return;
      setPartner({ name: d?.partner?.name || "", connected: !!d?.connected });
      // A private account never reaches the client at all, so anything here
      // with a scope is something one of the two chose to share.
      setHolds({
        accounts: (d?.accounts ?? []).some((a) => a.scope !== "private"),
        goals: (d?.goals ?? []).length > 0,
        // Decided server-side: these two live behind their own endpoints, and
        // the bar should not have to call them to know whether to show a tab.
        bills: d?.holds?.bills === true,
        activity: d?.holds?.activity === true,
      });
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => sync(), [sync]);

  // Never sit in a space that does not exist. This also covers the partnership
  // ending in another tab or on another device: the next load reports no
  // partner, and the view falls back to personal on its own.
  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w === "shared" && !partner.connected ? "personal" : w);
  }, [partner.connected]);

  const value = useMemo(
    () => ({ workspace: partner.connected ? workspace : "personal", setWorkspace, partner, holds, ready, refresh: sync }),
    [workspace, partner, holds, setWorkspace, ready, sync],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
