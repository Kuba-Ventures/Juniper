import { ArrowUpRight } from "lucide-react";
import { partnersForDomain, type Partner } from "@/lib/partners";
import { trackEvent } from "@/lib/analytics";

const sage = "#5C7A65";
const sans = "'Inter', sans-serif";

// Keyword sets that indicate a next-action is about a configured partner's
// product, matched against the partner's category. Kept specific to avoid
// false links (e.g. an insurance "policy" vs a "leave policy").
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "High-yield savings": [
    "savings account",
    "high-yield",
    "high yield",
    "hysa",
    "automatic transfer",
    "automatic monthly transfer",
    "monthly transfer",
    "automate",
    "set up an automatic",
  ],
  "Balance transfer": ["balance transfer", "consolidat", "0% intro", "intro-apr", "intro apr", "refinanc"],
  "Budgeting & net worth": ["budgeting", "net worth", "shared budget", "budgeting view"],
  "Term life insurance": ["life insurance", "term life", "life coverage"],
  "Legal documents": ["prenup", "attorney", "family law"],
  "Estate documents": ["estate document", "a will", "living trust", "will and trust"],
};

// The partner (if any) a next-action label maps to, hero-first.
export function partnerForNextAction(domain: string, label: string): Partner | null {
  const l = label.toLowerCase();
  for (const p of partnersForDomain(domain)) {
    const kws = CATEGORY_KEYWORDS[p.category] ?? [];
    if (kws.some((k) => l.includes(k))) return p;
  }
  return null;
}

function outboundUrl(partner: Partner, domain: string): string {
  try {
    const u = new URL(partner.url);
    u.searchParams.set("subid", `juniper-${domain}-action`);
    return u.toString();
  } catch {
    return partner.url;
  }
}

// A "Set it up" affiliate link shown beside a next-action when it maps to a
// partner. Renders nothing otherwise. stopPropagation keeps it from toggling
// the action's checkbox.
export function NextActionLink({ domain, label }: { domain: string; label: string }) {
  const partner = partnerForNextAction(domain, label);
  if (!partner) return null;

  return (
    <a
      href={outboundUrl(partner, domain)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        trackEvent("affiliate_click", {
          partner: partner.name,
          category: partner.category,
          plan_domain: domain,
          placement: "next_action_link",
        });
      }}
      title={`Open ${partner.name}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontFamily: sans,
        fontSize: 13,
        fontWeight: 600,
        color: sage,
        textDecoration: "none",
      }}
    >
      Set it up <ArrowUpRight size={14} strokeWidth={2.4} />
    </a>
  );
}
