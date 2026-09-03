import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useSession } from "@/lib/use-session";
import { acceptHouseholdInvite, fetchHouseholdInviteInfo } from "@/lib/household";
import "@/styles/juniper.css";

// Landing for /invite/household/:token, modeled directly on join-partner.tsx.
// The invited member is almost always signed out when they open the link, so
// accepting cannot be the first thing this page does: wait for the session,
// then accept, or hand off to sign-up/sign-in carrying ?household=<token>.
export default function JoinHousehold({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [state, setState] = useState<"joining" | "signed-out" | "error">("joining");
  const [error, setError] = useState<string | null>(null);
  const [household, setHousehold] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchHouseholdInviteInfo(token).then((info) => {
      if (alive) setHousehold(info.household);
    });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setState("signed-out"); return; }
    let alive = true;
    setState("joining");
    acceptHouseholdInvite(token).then((res) => {
      if (!alive) return;
      if (res.ok) setLocation("/app/household");
      else { setState("error"); setError(res.error ?? "This invite isn't valid anymore."); }
    });
    return () => { alive = false; };
  }, [session, token, setLocation]);

  const q = `?household=${encodeURIComponent(token)}`;
  const name = household || "a household";

  return (
    <div className="jnpr jp-page">
      <div className="card jp-card">
        {state === "joining" ? (
          <>
            <h2>Joining <em>{name}</em>…</h2>
            <p className="jp-sub">Connecting you to the household.</p>
          </>
        ) : state === "signed-out" ? (
          <>
            <h2>You've been invited to join <em>{name}</em> on Juniper</h2>
            <p className="jp-sub">
              Create an account and you'll land in the household's shared space.
            </p>
            <div className="jp-btns">
              <Link href={`/auth/sign-up${q}`} className="btn">Join {name}</Link>
              <Link href={`/auth/sign-in${q}`} className="btn ghost">I already have an account</Link>
            </div>
            <ul className="jp-what">
              <li>A space the household sees, with only what each of you chooses to share</li>
              <li>Nothing of yours is shared until you choose it, account by account</li>
              <li>Your transactions are never shared, whatever you turn on</li>
            </ul>
            <p className="jp-priv">Nobody in {name} can see anything of yours by accepting.</p>
          </>
        ) : (
          <>
            <h2>Couldn't join</h2>
            <p className="jp-sub">{error}</p>
            <div className="jp-btns">
              <button className="btn" onClick={() => setLocation("/app")}>Go to Juniper</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
