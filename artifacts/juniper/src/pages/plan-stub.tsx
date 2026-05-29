import { Link } from "wouter";

const sage = "#5C7A65";
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
  "prenup": "Prenup & Legal Planning",
};

export function PlanStub({ domain }: { domain: string }) {
  const title = DOMAIN_TITLES[domain] ?? domain;
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "100px 28px 80px", textAlign: "center" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: sage,
            margin: "0 0 18px",
          }}
        >
          {title}
        </p>
        <h1
          style={{
            fontFamily: serif,
            fontSize: "clamp(26px, 4vw, 34px)",
            fontWeight: 400,
            color: ink,
            margin: "0 0 14px",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
          }}
        >
          Your guided plan is coming soon.
        </h1>
        <p style={{ fontSize: 15, color: muted, margin: "0 0 28px", lineHeight: 1.65 }}>
          We're building this domain next. You'll walk through a focused conversation that ends with a
          structured plan you can return to and update over time.
        </p>
        <Link
          href="/app"
          style={{
            display: "inline-block",
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
          Back to dashboard
        </Link>
        <p style={{ fontSize: 12, color: muted, margin: "32px auto 0", maxWidth: 380, lineHeight: 1.6 }}>
          In the meantime you can ask anything in{" "}
          <Link href="/app/chat" style={{ color: sage, textDecoration: "none", borderBottom: `1px solid ${border}` }}>
            Chat
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
