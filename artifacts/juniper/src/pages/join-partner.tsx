import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { acceptInvite } from "@/lib/partner";
import "@/styles/juniper.css";

// Landing for /invite/partner/:token, the invited partner accepts here, which
// activates the partnership, then lands them in the shared workspace.
export default function JoinPartner({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<"joining" | "error">("joining");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    acceptInvite(token).then((res) => {
      if (!alive) return;
      if (res.ok) setLocation("/app/shared");
      else { setState("error"); setError(res.error ?? "This invite isn't valid anymore."); }
    });
    return () => { alive = false; };
  }, [token, setLocation]);

  return (
    <div className="jnpr" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: 40 }}>
        {state === "joining" ? (
          <>
            <div className="ce-mark" style={{ margin: "0 auto 16px" }}>♡</div>
            <h2 style={{ fontSize: 20 }}>Joining…</h2>
            <p style={{ color: "var(--jnpr-ink-3)", fontSize: 13.5, marginTop: 8 }}>Connecting you to the shared space.</p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20 }}>Couldn't join</h2>
            <p style={{ color: "var(--jnpr-ink-3)", fontSize: 13.5, margin: "8px 0 18px" }}>{error}</p>
            <button className="btn" onClick={() => setLocation("/app")}>Go to Juniper</button>
          </>
        )}
      </div>
    </div>
  );
}
