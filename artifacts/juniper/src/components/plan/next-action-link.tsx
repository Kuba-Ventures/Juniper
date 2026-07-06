import type React from "react";
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

const linkStyle: React.CSSProperties = {
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
};

// An affordance beside every next-action: a direct link when the action maps
// to a partner/resource, otherwise a "How?" button that asks Juniper to walk
// the user through the step. stopPropagation keeps it from toggling the
// action's checkbox.
export function NextActionLink({
  domain,
  label,
  onAskJuniper,
}: {
  domain: string;
  label: string;
  onAskJuniper: (label: string) => void;
}) {
  const r = resolveNextAction(domain, label);
  if (!r) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAskJuniper(label);
        }}
        title="Ask Juniper how"
        style={{ ...linkStyle, background: "none", border: "none", cursor: "pointer" }}
      >
        How? <ArrowUpRight size={14} strokeWidth={2.4} />
      </button>
    );
  }

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
      style={linkStyle}
    >
      {r.label} <ArrowUpRight size={14} strokeWidth={2.4} />
    </a>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────
// Milestones get a context-specific affordance, resolved in priority order:
// (1) find-a-provider "near me" search, (2) add-to-calendar for date/deadline
// milestones, (3) a partner/resource link (reusing next-action logic),
// (4) a "How?" walk-through fallback.

function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query + " near me")}`;
}

// Google Calendar "add event" template (a schedulable reminder; the user picks
// the date in Google).
function calendarUrl(label: string, domain: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Juniper: ${label}`,
    details: `A milestone from your Juniper ${domain.replace(/-/g, " ")} plan.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Provider-finding milestones → a local "near me" search.
const LOCAL_SEARCH: { keys: string[]; text: string; query: (label: string) => string }[] = [
  {
    keys: ["attorney", "lawyer", "family law", "legal counsel", "representation"],
    text: "Lawyers near me",
    query: (l) => (/estate|will|trust/.test(l.toLowerCase()) ? "estate planning attorney" : "family law attorney"),
  },
  { keys: ["daycare", "childcare", "child care", "nanny"], text: "Find childcare near me", query: () => "daycare" },
  { keys: ["realtor", "real estate agent", "real estate"], text: "Realtors near me", query: () => "real estate agent" },
  { keys: ["financial advisor", "financial planner"], text: "Advisors near me", query: () => "financial advisor" },
  { keys: ["lender", "loan officer"], text: "Lenders near me", query: () => "mortgage lender" },
];

// Date/deadline milestones → add to calendar.
const CALENDAR_KEYS = ["before the wedding", "days before", "by the wedding", "deadline", "expire"];

type MilestoneAffordance =
  | { kind: "link"; text: string; url: string; sponsored: boolean; partner?: string; category?: string }
  | { kind: "calendar" }
  | { kind: "ask" };

export function resolveMilestoneAffordance(domain: string, label: string): MilestoneAffordance {
  const l = label.toLowerCase();
  for (const s of LOCAL_SEARCH) {
    if (s.keys.some((k) => l.includes(k))) {
      return { kind: "link", text: s.text, url: mapsSearchUrl(s.query(label)), sponsored: false };
    }
  }
  if (CALENDAR_KEYS.some((k) => l.includes(k))) return { kind: "calendar" };
  const r = resolveNextAction(domain, label);
  if (r) return { kind: "link", text: r.label, url: r.url, sponsored: r.sponsored, partner: r.partner, category: r.category };
  return { kind: "ask" };
}

// The single, context-appropriate affordance shown under a milestone.
export function MilestoneAssist({
  domain,
  label,
  onAskJuniper,
}: {
  domain: string;
  label: string;
  onAskJuniper: (label: string) => void;
}) {
  const a = resolveMilestoneAffordance(domain, label);

  if (a.kind === "ask") {
    return (
      <button onClick={() => onAskJuniper(label)} title="Ask Juniper how" style={{ ...linkStyle, fontSize: 12.5, background: "none", border: "none", cursor: "pointer" }}>
        How? <ArrowUpRight size={13} strokeWidth={2.4} />
      </button>
    );
  }
  if (a.kind === "calendar") {
    return (
      <a href={calendarUrl(label, domain)} target="_blank" rel="noopener noreferrer" title="Add a reminder to Google Calendar" style={{ ...linkStyle, fontSize: 12.5 }}>
        Add to calendar <ArrowUpRight size={13} strokeWidth={2.4} />
      </a>
    );
  }
  return (
    <a
      href={outboundUrl(a.url, domain, a.sponsored)}
      target="_blank"
      rel={a.sponsored ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      onClick={() => {
        if (a.sponsored && a.partner) {
          trackEvent("affiliate_click", { partner: a.partner, category: a.category, plan_domain: domain, placement: "milestone_link" });
        } else {
          trackEvent("resource_click", { resource: a.url, plan_domain: domain, placement: "milestone_link" });
        }
      }}
      style={{ ...linkStyle, fontSize: 12.5 }}
    >
      {a.text} <ArrowUpRight size={13} strokeWidth={2.4} />
    </a>
  );
}
