import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useSession } from "@/lib/use-session";
import { acceptInvite, fetchInviteInfo } from "@/lib/partner";
import "@/styles/juniper.css";

// Landing for /invite/partner/:token, the invited partner accepts here, which
// activates the partnership, then lands them in the shared workspace.
//
// The invited partner is almost always signed out when they open the link, so
// accepting cannot be the first thing this page does. Wait for the session to
// resolve: with one, accept straight away; without one, hand off to sign-up or
// sign-in carrying ?partner=<token>, which those pages accept on arrival. The
// param is deliberately not ?invite=, which the older plan-invite flow owns.
//
// ── WHAT #172 CHANGED HERE ─────────────────────────────────────────────────
//
// This page used to say "You've been invited to Juniper" over a heart, with no
// idea who had invited them and nothing about what accepting would do. Somebody
// arriving from a text message therefore had to take on trust both that the
// invitation was real and that accepting it would not hand a stranger their
// bank balances.
//
// It now NAMES the person, from /api/partner/invite (the token resolves to their
// first name and nothing else), pairs their initial with an empty "you", and
// states the three facts that decide whether a reasonable person accepts: what
// the shared space is, that nothing is shared until they choose it account by
// account, and that transactions are never shared at all. Those three are not
// marketing copy, they are the behaviour migration 0020 and the share sheet
// actually implement.
//
// The name is a NICETY, not a dependency: `inviter` is null for a spent token,
// for a member with no name on their profile, and for a failed request, and the
// page reads correctly in all three cases. An invitation that cannot be signed
// is still an invitation.
export default function JoinPartner({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [state, setState] = useState<"joining" | "signed-out" | "error">("joining");
  const [error, setError] = useState<string | null>(null);
  const [inviter, setInviter] = useState<string | null>(null);

  // Asked for immediately and in parallel with the session, because the whole
  // point is that the first thing on screen says who invited them.
  useEffect(() => {
    let alive = true;
    void fetchInviteInfo(token).then((info) => {
      if (alive) setInviter(info.inviter);
    });
    return () => { alive = false; };
  }, [token]);

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
  const who = inviter || "Someone";
  const initial = inviter ? inviter.charAt(0).toUpperCase() : "?";

  return (
    <div className="jnpr jp-page">
      <div className="card jp-card">
        {state === "joining" ? (
          <>
            <div className="jp-pair">
              <span className="jp-av">{initial}</span>
              <span className="jp-plus">+</span>
              <span className="jp-av you">You</span>
            </div>
            <h2>Joining{inviter ? <> <em>{inviter}</em></> : null}…</h2>
            <p className="jp-sub">Connecting you to the shared space.</p>
          </>
        ) : state === "signed-out" ? (
          <>
            <div className="jp-pair">
              <span className="jp-av">{initial}</span>
              <span className="jp-plus">+</span>
              <span className="jp-av you">You</span>
            </div>
            <h2>
              {inviter ? <><em>{inviter}</em> invited you to Juniper</> : <>You have been invited to Juniper</>}
            </h2>
            <p className="jp-sub">
              {inviter ? `${inviter} has` : "Somebody has"} asked you to plan your money together.
              Create an account and you will land in the shared space with them.
            </p>
            <div className="jp-btns">
              <Link href={`/auth/sign-up${q}`} className="btn">
                {inviter ? `Join ${inviter} on Juniper` : "Create an account"}
              </Link>
              <Link href={`/auth/sign-in${q}`} className="btn ghost">I already have an account</Link>
            </div>
            {/* The three facts that decide whether a reasonable person accepts,
                and each one is a behaviour rather than a promise: the shared
                space (0012), private until chosen per account (0020 and the
                share sheet), and transactions never shared at all, which is why
                the three-way scope chip was cut to two in #195. */}
            <ul className="jp-what">
              <li>A space you both see, with the goals you are saving toward</li>
              <li>Nothing of yours is shared until you choose it, account by account</li>
              <li>Your transactions are never shared, whatever you turn on</li>
            </ul>
            <p className="jp-priv">
              {inviter ? `${inviter} cannot` : "They cannot"} see anything of yours by accepting.
            </p>
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
