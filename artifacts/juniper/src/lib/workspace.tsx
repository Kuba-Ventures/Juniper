// Workspace context (Stage 7 partner layer, front-end).
//
// Juniper is individual-first. A member can optionally connect a partner; once
// connected, a second "workspace" appears and the app can switch between the
// member's private finances and the shared view. This holds that state (which
// workspace is active + whether a partner is connected), persisted to
// localStorage so it survives navigation. All data behind it is mock for now —
// real cross-partner data sharing is a later backend stage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Workspace = "personal" | "shared";

export interface PartnerState {
  name: string;
  connected: boolean;
}

interface WorkspaceCtx {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  partner: PartnerState;
  connect: (name?: string) => void;
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

  // Never sit in the shared workspace without a partner connected.
  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w === "shared" && !partner.connected ? "personal" : w);
  }, [partner.connected]);

  const connect = useCallback((name?: string) => {
    setPartner((p) => ({ name: (name || p.name || "Devin").trim() || "Devin", connected: true }));
  }, []);

  const disconnect = useCallback(() => {
    setPartner((p) => ({ ...p, connected: false }));
    setWorkspaceState("personal");
  }, []);

  const value = useMemo(
    () => ({ workspace: partner.connected ? workspace : "personal", setWorkspace, partner, connect, disconnect }),
    [workspace, partner, setWorkspace, connect, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
