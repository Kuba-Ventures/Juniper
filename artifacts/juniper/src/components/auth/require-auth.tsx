import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/use-session";

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

  useEffect(() => {
    if (session === null) setLocation("/auth/sign-in");
  }, [session, setLocation]);

  if (session === undefined) return <LoadingShell />;
  if (session === null) return null;
  return <>{children}</>;
}
