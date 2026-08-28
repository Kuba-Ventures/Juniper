import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/partner";
import "@/styles/juniper.css";

// Landing for /invite/partner/:token, the invited partner accepts here, which
// activates the partnership, then lands them in the shared workspace.
//
// The invited partner is almost always signed out when they open the link, so
// accepting cannot be the first thing this page does. Wait for the session to
// resolve: with one, accept straight away; without one, hand off to sign-up or
// sign-in carrying ?partner=<token>, which those pages accept on arrival. The
// param is deliberately not ?invite=, which the older plan-invite flow owns.
export default function JoinPartner({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [state, setState] = useState<"joining" | "signed-out" | "error">("joining");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setState("signed-out"); return; }
    let alive = true;
    setState("joining");
    acceptInvite(token).then((res) => {
      if (!alive) return;
      if (res.ok) setLocation("/app/shared");
      else { setState("error"); setError(res.error ?? "This invite isn't valid anymore."); }
    });
    return () => { alive = false; };
  }, [session, token, setLocation]);

  const q = `?partner=${encodeURIComponent(token)}`;

  return (
    <div className="jnpr" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: 40 }}>
        {state === "joining" ? (
          <>
            <div className="ce-mark" style={{ margin: "0 auto 16px" }}>♡</div>
            <h2 style={{ fontSize: 20 }}>Joining…</h2>
            <p style={{ color: "var(--jnpr-ink-3)", fontSize: 13.5, marginTop: 8 }}>Connecting you to the shared space.</p>
          </>
        ) : state === "signed-out" ? (
          <>
            <div className="ce-mark" style={{ margin: "0 auto 16px" }}>♡</div>
            <h2 style={{ fontSize: 20 }}>You've been invited to Juniper</h2>
            <p style={{ color: "var(--jnpr-ink-3)", fontSize: 13.5, margin: "8px 0 20px" }}>
              Create an account or sign in, and you'll land in the shared space together.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <Link href={`/auth/sign-up${q}`} className="btn" style={{ justifyContent: "center", textDecoration: "none" }}>
                Create an account
              </Link>
              <Link href={`/auth/sign-in${q}`} className="btn ghost" style={{ justifyContent: "center", textDecoration: "none" }}>
                Sign in
              </Link>
            </div>
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
