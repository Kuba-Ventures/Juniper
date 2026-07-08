import { useState } from "react";
import type React from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { partnersForDomain, type Partner } from "@/lib/partners";
import { trackEvent } from "@/lib/analytics";

// Browsable marketplace of every listing configured for a plan's domain. Sits
// below the featured hero card on a completed plan. This is the two-sided
// surface: today it renders seeded curated/scraped placeholders; the same grid
// will later carry real self-listed merchants. All outbound URLs remain
// placeholders until the affiliate compliance/licensing item clears.

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageFill = "rgba(92,122,101,0.10)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

// Backstop the em-dash convention (all user-facing text is stripped elsewhere).
function displayContent(text: string): string {
  return text
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/\s+--\s+/g, ", ");
}

const sectionHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 18,
  fontWeight: 400,
  color: ink,
  margin: "0 0 6px",
};

// Append a Juniper-side subid so outbound clicks can be reconciled for payout
// later. Placeholder plumbing; falls back to the raw url if it isn't parseable.
function outboundUrl(partner: Partner, domain: string): string {
  try {
    const u = new URL(partner.url);
    u.searchParams.set("subid", `juniper-${domain}-marketplace`);
    return u.toString();
  } catch {
    return partner.url;
  }
}

// Fire the GA4 outbound event (no-ops outside production; also routes through
// the engaged-session guard) before the browser follows the sponsored link.
function fireClick(partner: Partner, domain: string): void {
  trackEvent("affiliate_click", {
    partner: partner.name,
    category: partner.category,
    plan_domain: domain,
    placement: "marketplace",
    source: partner.source,
  });
}

// Compact brand tile: real logo on a white chip, colored monogram fallback.
function LogoTile({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(false);
  const base: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 10,
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
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5, boxSizing: "border-box" }}
        />
      </div>
    );
  }
  return (
    <div style={{ ...base, background: partner.color, color: "#fff", fontFamily: serif, fontSize: 15, fontWeight: 600 }}>
      {partner.initial}
    </div>
  );
}

function ProviderCard({
  partner,
  domain,
  featured,
  used,
}: {
  partner: Partner;
  domain: string;
  featured: boolean;
  used: boolean;
}) {
  return (
    <a
      href={outboundUrl(partner, domain)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={() => fireClick(partner, domain)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#fff",
        border: `1px solid ${featured ? sage : border}`,
        borderRadius: 12,
        padding: 16,
        textDecoration: "none",
        color: "inherit",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoTile partner={partner} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: serif, fontSize: 15.5, fontWeight: 500, color: ink }}>
              {partner.name}
            </span>
            {featured && (
              <span
                style={{
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontFamily: sans,
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: sage,
                  background: sageFill,
                }}
              >
                FEATURED
              </span>
            )}
            {used && (
              <span
                style={{
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontFamily: sans,
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: muted,
                  border: `1px solid ${border}`,
                }}
              >
                YOU USE THIS
              </span>
            )}
          </div>
          <p
            style={{
              fontFamily: sans,
              fontSize: 9.5,
              letterSpacing: "0.08em",
              color: muted,
              fontWeight: 600,
              margin: "2px 0 0",
            }}
          >
            {partner.category.toUpperCase()}
          </p>
        </div>
      </div>

      <p style={{ fontFamily: sans, fontSize: 13.5, color: ink, lineHeight: 1.5, margin: 0, flex: 1 }}>
        {displayContent(partner.blurb)}
      </p>

      {partner.tags && partner.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {partner.tags.map((t) => (
            <span
              key={t}
              style={{
                fontFamily: sans,
                fontSize: 11,
                color: muted,
                background: "rgba(92,122,101,0.06)",
                border: `1px solid ${border}`,
                borderRadius: 999,
                padding: "2px 9px",
              }}
            >
              {displayContent(t)}
            </span>
          ))}
        </div>
      )}

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          marginTop: 2,
          fontFamily: sans,
          fontSize: 13,
          fontWeight: 600,
          color: sage,
        }}
      >
        Visit <ArrowUpRight size={14} strokeWidth={2.4} />
      </span>
    </a>
  );
}

// The full marketplace grid for a completed plan's domain: every configured
// listing, featured/hero first, providers the user already uses sorted down.
// Renders nothing if the domain has no listings. Callers gate on completion.
export function MarketplaceList({
  domain,
  connections = [],
}: {
  domain: string;
  connections?: string[];
}) {
  const listings = partnersForDomain(domain);
  if (listings.length === 0) return null;

  // "You use this" if a connection name matches the provider (e.g. "SoFi" ~
  // "SoFi Savings"). Used providers sort down; ties keep config order so the
  // hero stays first among unused ones.
  const uses = (p: Partner) =>
    connections.some((c) => c && p.name.toLowerCase().includes(c.toLowerCase()));
  const ordered = [...listings]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(uses(a.p)) - Number(uses(b.p)) || a.i - b.i)
    .map((x) => x.p);
  const featuredName = listings[0].name; // the configured hero, however it sorts

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={sectionHeading}>Explore services</h2>
      <p style={{ fontFamily: sans, fontSize: 13.5, color: muted, margin: "0 0 12px", lineHeight: 1.5 }}>
        Providers for your {domain.replace(/-/g, " ")} plan. We rank by fit, not by payout.
      </p>

      {/* FTC-style disclosure, above the links (before any click-out). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 14,
          borderRadius: 10,
          padding: 12,
          background: "#fff",
          border: `1px solid ${border}`,
        }}
      >
        <Info size={15} color={muted} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontFamily: sans, fontSize: 12, color: muted, lineHeight: 1.5, margin: 0 }}>
          Juniper may earn a commission if you open an account through these links. Listings are for
          comparison, not an endorsement.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {ordered.map((partner) => (
          <ProviderCard
            key={partner.name}
            partner={partner}
            domain={domain}
            featured={partner.name === featuredName}
            used={uses(partner)}
          />
        ))}
      </div>
    </section>
  );
}
