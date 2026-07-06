import { useState } from "react";
import type React from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { partnersForDomain, type Partner } from "@/lib/partners";
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

// The 48px brand tile: renders the real logo on a clean white chip, falling
// back to the colored monogram if there's no logoUrl or the image fails.
function LogoTile({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(false);
  const base: React.CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  if (partner.logoUrl && !failed) {
    return (
      <div style={{ ...base, background: "#fff", border: `1px solid ${border}`, overflow: "hidden" }}>
        <img
          src={partner.logoUrl}
          alt={`${partner.name} logo`}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        background: partner.color,
        color: "#fff",
        fontFamily: serif,
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      {partner.initial}
    </div>
  );
}

function AffiliateCard({
  partner,
  domain,
  primary,
  used,
}: {
  partner: Partner;
  domain: string;
  primary: boolean;
  used: boolean;
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
      {/* brand logo (monogram fallback) + category badge */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <LogoTile partner={partner} />
        <div
          style={{
            position: "absolute",
            bottom: -6,
            right: -6,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: sage,
            border: "2px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CategoryIcon size={14} color="#fff" strokeWidth={2.4} />
        </div>
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: ink }}>
            {partner.name}
          </span>
          {used ? (
            <span
              style={{
                borderRadius: 999,
                padding: "2px 8px",
                fontFamily: sans,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: muted,
                border: `1px solid ${border}`,
              }}
            >
              YOU USE THIS
            </span>
          ) : (
            primary && (
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
            )
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

// The full picks block for a completed plan: every configured partner for the
// domain (hero first, marked RECOMMENDED) + the required FTC-style disclosure.
// Renders nothing if the domain has no configured partners. Callers must gate
// on plan completion (see PlanView).
export function PlanAffiliatePicks({
  domain,
  connections = [],
}: {
  domain: string;
  connections?: string[];
}) {
  const partners = partnersForDomain(domain);
  if (partners.length === 0) return null;

  // "You use this" if a connection name matches the partner (e.g. "SoFi" ~
  // "SoFi Savings"). Partners the user already uses drop below fresh ones, so
  // the RECOMMENDED slot goes to something new.
  const uses = (p: Partner) =>
    connections.some((c) => c && p.name.toLowerCase().includes(c.toLowerCase()));
  const ordered = [...partners].sort((a, b) => Number(uses(a)) - Number(uses(b)));
  const firstUnusedIdx = ordered.findIndex((p) => !uses(p));

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Recommended for this step</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ordered.map((partner, i) => (
          <AffiliateCard
            key={partner.name}
            partner={partner}
            domain={domain}
            primary={i === firstUnusedIdx}
            used={uses(partner)}
          />
        ))}
      </div>

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
