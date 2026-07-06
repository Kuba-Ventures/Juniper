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

// Cross-domain help links for common actions that aren't tied to the plan's
// own affiliate partner (so e.g. "pull your credit score" and a savings action
// on any plan still become actionable). `sponsored` links carry a partner
// (monetized); others are neutral free resources. URLs are placeholders/live
// destinations; swap for approved affiliate links where applicable.
type HelpLink = {
  keys: string[];
  label: string;
  url: string;
  sponsored: boolean;
  partner?: string;
  category?: string;
};
const HELP_LINKS: HelpLink[] = [
  {
    keys: ["credit score", "credit report", "credit karma"],
    label: "Check score",
    url: "https://www.creditkarma.com/",
    sponsored: false,
  },
  {
    keys: ["savings account", "high-yield", "high yield", "automatic transfer", "automatic monthly transfer", "monthly transfer", "automate"],
    label: "Open account",
    url: "https://www.sofi.com/",
    sponsored: true,
    partner: "SoFi Savings",
    category: "High-yield savings",
  },
  {
    keys: ["529", "college fund", "college savings"],
    label: "Compare 529s",
    url: "https://www.savingforcollege.com/",
    sponsored: false,
  },
  {
    keys: ["pre-approval", "preapproval", "pre approval"],
    label: "Learn how",
    url: "https://www.consumerfinance.gov/owning-a-home/",
    sponsored: false,
  },
];

type Resolved = { label: string; url: string; sponsored: boolean; partner?: string; category?: string };

// Resolve a next-action to an actionable link: the domain's partner first
// (sponsored "Set it up"), then a cross-domain help link, else nothing.
export function resolveNextAction(domain: string, label: string): Resolved | null {
  const partner = partnerForNextAction(domain, label);
  if (partner) {
    return { label: "Set it up", url: partner.url, sponsored: true, partner: partner.name, category: partner.category };
  }
  const l = label.toLowerCase();
  const help = HELP_LINKS.find((h) => h.keys.some((k) => l.includes(k)));
  if (help) {
    return { label: help.label, url: help.url, sponsored: help.sponsored, partner: help.partner, category: help.category };
  }
  return null;
}

function outboundUrl(url: string, domain: string, sponsored: boolean): string {
  if (!sponsored) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("subid", `juniper-${domain}-action`);
    return u.toString();
  } catch {
    return url;
  }
}

// A link beside a next-action when it maps to a partner or a helpful resource.
// Renders nothing otherwise. stopPropagation keeps it from toggling the
// action's checkbox.
export function NextActionLink({ domain, label }: { domain: string; label: string }) {
  const r = resolveNextAction(domain, label);
  if (!r) return null;

  return (
    <a
      href={outboundUrl(r.url, domain, r.sponsored)}
      target="_blank"
      rel={r.sponsored ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      onClick={(e) => {
        e.stopPropagation();
        if (r.sponsored && r.partner) {
          trackEvent("affiliate_click", {
            partner: r.partner,
            category: r.category,
            plan_domain: domain,
            placement: "next_action_link",
          });
        } else {
          trackEvent("resource_click", { resource: r.url, plan_domain: domain, placement: "next_action_link" });
        }
      }}
      title={r.sponsored && r.partner ? `Open ${r.partner}` : "Open resource"}
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
      {r.label} <ArrowUpRight size={14} strokeWidth={2.4} />
    </a>
  );
}
