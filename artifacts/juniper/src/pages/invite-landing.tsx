import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useSession } from "@/lib/use-session";
import { fetchInvite, acceptInvite, type InviteInfo } from "@/lib/invites";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const DOMAIN_TITLES: Record<string, string> = {
  "home-buying": "Home Buying",
  "combining-finances": "Combining Finances",
  "debt-paydown": "Debt Paydown",
  "baby-planning": "Baby Planning",
  prenup: "Prenup & Legal",
};

export default function InviteLanding({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchInvite(token).then((data) => {
      if (cancelled) return;
      if (!data) setError("This invite link is invalid or has expired.");
      else setInfo(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, token]);

  useEffect(() => {
    if (!info) return;
    if (info.partner_is_self || info.inviter_is_self) {
      setLocation(`/app/plans/${info.domain}`);
    }
  }, [info, setLocation]);

  async function handleAccept() {
    if (!info) return;
    setAccepting(true);
    const result = await acceptInvite(token);
    if (result?.ok) {
      setLocation(`/app/plans/${result.domain}`);
    } else {
      setError("Could not accept invite. Try again.");
      setAccepting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: cream,
        fontFamily: sans,
        padding: "0 24px",
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
        }}
      >
        <img
          src="/logo.png"
          alt="Juniper"
          style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto 22px" }}
        />

        {session === undefined || loading ? (
          <p style={{ color: muted, fontSize: 14 }}>Loading…</p>
        ) : error ? (
          <>
            <h1
              style={{
                fontFamily: serif,
                fontSize: 24,
                fontWeight: 400,
                color: ink,
                margin: "0 0 12px",
              }}
            >
              Hmm.
            </h1>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.6, margin: "0 0 24px" }}>
              {error}
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "10px 22px",
                background: "transparent",
                color: sage,
                border: `1.5px solid ${sage}`,
                borderRadius: 8,
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back to Juniper
            </Link>
          </>
        ) : !session ? (
          <>
            <h1
              style={{
                fontFamily: serif,
                fontSize: 26,
                fontWeight: 400,
                color: ink,
                margin: "0 0 14px",
                lineHeight: 1.25,
              }}
            >
              You've been invited to plan together on Juniper.
            </h1>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.6, margin: "0 0 28px" }}>
              Sign in or create an account to accept this invite.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href={`/auth/sign-up?invite=${encodeURIComponent(token)}`}
                style={{
                  display: "block",
                  padding: "12px 22px",
                  background: sage,
                  color: "#fff",
                  borderRadius: 8,
                  fontFamily: sans,
                  fontSize: 15,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Create an account
              </Link>
              <Link
                href={`/auth/sign-in?invite=${encodeURIComponent(token)}`}
                style={{
                  display: "block",
                  padding: "11px 22px",
                  background: "transparent",
                  color: sage,
                  border: `1.5px solid ${sage}`,
                  borderRadius: 8,
                  fontFamily: sans,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Sign in
              </Link>
            </div>
          </>
        ) : info ? (
          <>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: sage,
                margin: "0 0 12px",
              }}
            >
              {DOMAIN_TITLES[info.domain] ?? info.domain}
            </p>
            <h1
              style={{
                fontFamily: serif,
                fontSize: 26,
                fontWeight: 400,
                color: ink,
                margin: "0 0 16px",
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              {info.inviter_first_name} invited you to plan this together.
            </h1>
            {info.goal_headline && (
              <p
                style={{
                  fontSize: 15,
                  color: ink,
                  lineHeight: 1.65,
                  margin: "0 0 8px",
                  fontFamily: serif,
                  fontStyle: "italic",
                }}
              >
                "{info.goal_headline}"
              </p>
            )}
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.65, margin: "16px 0 28px" }}>
              When you accept, you'll walk through your own version of this plan. Once you're both
              done, Juniper will surface where you align and where you don't.
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              style={{
                padding: "12px 26px",
                background: sage,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontFamily: sans,
                fontSize: 15,
                fontWeight: 500,
                cursor: accepting ? "default" : "pointer",
                opacity: accepting ? 0.7 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {accepting ? "Accepting…" : "Accept invite"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
