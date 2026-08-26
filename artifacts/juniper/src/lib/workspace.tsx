// Workspace context (Stage 7 partner layer, front-end).
//
// Juniper is individual-first. A member can optionally connect a partner; once
// connected, a second "workspace" appears and the app can switch between the
// member's private finances and the shared view. This holds that state (which
// workspace is active + whether a partner is connected), persisted to
// localStorage so it survives navigation.
//
// Stage 4c: nothing mounts this provider. The shared workspace it drove is
// unrouted (see src/pages/juniper-app.tsx) because its pages still render a
// seeded household. The `connect()` action went with it: it flipped
// `partner.connected` from the client alone, on a "Preview shared space" button,
// with no server partnership behind it, which is exactly how a member ended up
// looking at Maya and Devin's money. Whoever restores the workspace should leave
// it that way and let the /api/partner sync below be the only thing that can
// connect a partner.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchPartner } from "@/lib/partner";

export type Workspace = "personal" | "shared";

export interface PartnerState {
  name: string;
  connected: boolean;
}

interface WorkspaceCtx {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  partner: PartnerState;
  disconnect: () => void;
}

const KEY = "jnpr.workspace.v1";
const DEFAULT: { workspace: Workspace; partner: PartnerState } = {
  workspace: "personal",
  partner: { name: "Devin", connected: false },
};

function load(): typeof DEFAULT {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<typeof DEFAULT>;
    return {
      workspace: p.workspace === "shared" ? "shared" : "personal",
      partner: { name: p.partner?.name || "Devin", connected: !!p.partner?.connected },
    };
  } catch {
    return DEFAULT;
  }
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const initial = load();
  const [workspace, setWorkspaceState] = useState<Workspace>(initial.workspace);
  const [partner, setPartner] = useState<PartnerState>(initial.partner);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ workspace, partner })); } catch { /* ignore */ }
  }, [workspace, partner]);

  // Sync from the server: a real active partnership connects (and names) the
  // partner. Only ever upgrades to connected, it won't undo a local demo preview.
  useEffect(() => {
    let alive = true;
    fetchPartner().then((d) => {
      if (alive && d?.connected) setPartner({ name: d.partner?.name || "Devin", connected: true });
    });
    return () => { alive = false; };
  }, []);

  // Never sit in the shared workspace without a partner connected.
  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w === "shared" && !partner.connected ? "personal" : w);
  }, [partner.connected]);

  const disconnect = useCallback(() => {
    setPartner((p) => ({ ...p, connected: false }));
    setWorkspaceState("personal");
  }, []);

  const value = useMemo(
    () => ({ workspace: partner.connected ? workspace : "personal", setWorkspace, partner, disconnect }),
    [workspace, partner, setWorkspace, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
