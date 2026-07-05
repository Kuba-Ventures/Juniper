import type React from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { heroPartner, type Partner } from "@/lib/partners";
import { trackEvent } from "@/lib/analytics";

// Matches the live PlanView palette (sage, Fraunces) so the card blends into
// the completed plan it sits in.
const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageFill = "rgba(92,122,101,0.10)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 14px",
};

// Append a Juniper-side subid so outbound clicks can be reconciled for payout
// later. Placeholder plumbing; the real subid scheme comes with the tracking
// spec. Falls back to the raw url if it isn't a parseable absolute URL.
function outboundUrl(partner: Partner, domain: string): string {
  try {
    const u = new URL(partner.url);
    u.searchParams.set("subid", `juniper-${domain}`);
    return u.toString();
  } catch {
    return partner.url;
  }
}

// Fire the GA4 outbound event (no-ops outside production via trackEvent's
// guard) before the browser follows the sponsored link.
function fireClick(partner: Partner, domain: string): void {
  trackEvent("affiliate_click", {
    partner: partner.name,
    category: partner.category,
    plan_domain: domain,
    placement: "plan_next_action",
  });
}

function AffiliateCard({
  partner,
  domain,
  primary,
}: {
  partner: Partner;
  domain: string;
  primary: boolean;
}) {
  const CategoryIcon = partner.categoryIcon;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        background: "#fff",
        border: `1px solid ${primary ? sage : border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* monogram logo placeholder + category badge */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: partner.color,
            color: "#fff",
            fontFamily: serif,
            fontSize: 18,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {partner.initial}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: -6,
            right: -6,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: sageFill,
            border: "2px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CategoryIcon size={13} color={sage} strokeWidth={2.2} />
        </div>
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: ink }}>
            {partner.name}
          </span>
          {primary && (
            <span
              style={{
                borderRadius: 999,
                padding: "2px 8px",
                fontFamily: sans,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: sage,
                background: sageFill,
              }}
            >
              RECOMMENDED
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: sans,
            fontSize: 10,
            letterSpacing: "0.08em",
            color: muted,
            fontWeight: 600,
            margin: "2px 0 0",
          }}
        >
          {partner.category.toUpperCase()}
        </p>
        <p style={{ fontFamily: sans, fontSize: 14, color: ink, lineHeight: 1.5, margin: "6px 0 0" }}>
          {partner.description}
        </p>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: muted, margin: "4px 0 0" }}>
          Why this: {partner.fit}
        </p>

        <a
          href={outboundUrl(partner, domain)}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={() => fireClick(partner, domain)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 12,
            borderRadius: 999,
            padding: "8px 16px",
            background: sage,
            color: "#fff",
            fontFamily: sans,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open account <ArrowUpRight size={15} strokeWidth={2.4} />
        </a>
      </div>
    </div>
  );
}

// The full picks block for a completed plan: hero partner + the required
// FTC-style disclosure. Renders nothing if the domain has no configured
// partner. Callers must gate on plan completion (see PlanView).
export function PlanAffiliatePicks({ domain }: { domain: string }) {
  const partner = heroPartner(domain);
  if (!partner) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Recommended for this step</h2>

      <AffiliateCard partner={partner} domain={domain} primary />

      {/* Required FTC-style disclosure — kept visible, not behind a tooltip. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginTop: 12,
          borderRadius: 10,
          padding: 12,
          background: "#fff",
          border: `1px solid ${border}`,
        }}
      >
        <Info size={15} color={muted} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontFamily: sans, fontSize: 12, color: muted, lineHeight: 1.5, margin: 0 }}>
          Juniper may earn a commission if you open an account through these links. We rank by fit
          for your plan, not by payout.
        </p>
      </div>
    </section>
  );
}
