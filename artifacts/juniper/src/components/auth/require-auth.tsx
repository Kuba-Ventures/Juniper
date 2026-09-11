import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/use-session";
import { useIdleLogout } from "@/lib/use-idle-logout";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const cream = "#FAF7F2";
const muted = "#6B6B6B";
const sans = "'Inter', sans-serif";

function LoadingShell() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: cream,
        fontFamily: sans,
        color: muted,
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const [, setLocation] = useLocation();

  // Only tracks idle time while actually signed in; signing out here feeds
  // back into the session-null effect below, which does the redirect.
  useIdleLogout(!!session, IDLE_TIMEOUT_MS);

  useEffect(() => {
    if (session === null) setLocation("/auth/sign-in");
  }, [session, setLocation]);

  if (session === undefined) return <LoadingShell />;
  if (session === null) return null;
  return <>{children}</>;
}
