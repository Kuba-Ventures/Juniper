// Affiliate partner config, keyed by plan domain.
// ------------------------------------------------------------------
// Config-first on purpose: offers are few and change rarely, so this avoids a
// migration. If we later want to swap offers without deploying, migrate to a
// Supabase `partners` table (remember: new tables need GRANT SELECT TO
// authenticated + an RLS read policy or they silently 401).
//
// Every `url` below is a PLACEHOLDER. Swap for an approved affiliate link
// before launch. Regulated categories (mortgage, insurance, credit cards,
// legal) may need specific disclosures/licensing before going live.
//
// Recommendation mapping is deterministic by domain — no LLM/synthesis change.
// (A future option is per-recommendation category tagging emitted by
// synthesis; not built now.)

import {
  PiggyBank,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  FileText,
  type LucideIcon,
} from "lucide-react";

export type Partner = {
  name: string;
  initial: string; // monogram stand-in for a real logo asset
  color: string; // logo-tile background
  category: string; // e.g. "High-yield savings"
  categoryIcon: LucideIcon; // badge icon on the logo tile
  description: string;
  fit: string; // the "Why this: …" line
  url: string; // PLACEHOLDER referral URL
};

// The first entry per domain is the hero (the only one rendered at launch, so
// it doesn't read like a comparison table). A second entry is an optional
// alternative kept in config for later; it is NOT rendered yet.
export const PARTNERS: Record<string, Partner[]> = {
  "home-buying": [
    {
      name: "SoFi Savings",
      initial: "S",
      color: "#1E3A5F",
      category: "High-yield savings",
      categoryIcon: PiggyBank,
      description: "No-fee high-yield savings, set up an automatic down-payment transfer.",
      fit: "Matches your automated-savings action",
      url: "https://example.com/partners/sofi-savings",
    },
    {
      name: "Marcus by Goldman Sachs",
      initial: "M",
      color: "#3B3B3B",
      category: "High-yield savings",
      categoryIcon: PiggyBank,
      description: "Simple high-yield savings, no minimums or fees.",
      fit: "Alternative with no minimum balance",
      url: "https://example.com/partners/marcus",
    },
  ],
  "combining-finances": [
    {
      name: "Monarch",
      initial: "M",
      color: "#2C5540",
      category: "Budgeting & net worth",
      categoryIcon: TrendingUp,
      description: "Shared budgeting and net-worth tracking built for couples.",
      fit: "Connects the accounts your plan tracks",
      url: "https://example.com/partners/monarch",
    },
  ],
  "debt-paydown": [
    {
      name: "Balance-transfer card",
      initial: "0%",
      color: "#6B4A8A",
      category: "Balance transfer",
      categoryIcon: CreditCard,
      description: "0% intro-APR cards to consolidate high-interest debt.",
      fit: "Cuts interest while you pay down",
      url: "https://example.com/partners/balance-transfer",
    },
  ],
  "baby-planning": [
    {
      name: "Policygenius",
      initial: "P",
      color: "#B5462F",
      category: "Term life insurance",
      categoryIcon: ShieldCheck,
      description: "Compare term life quotes in minutes from top insurers.",
      fit: "Well-timed for new parents",
      url: "https://example.com/partners/policygenius",
    },
    {
      name: "Ladder",
      initial: "L",
      color: "#1F6F63",
      category: "Term life insurance",
      categoryIcon: ShieldCheck,
      description: "Flexible term life you can adjust as your family grows.",
      fit: "Coverage you can scale later",
      url: "https://example.com/partners/ladder",
    },
  ],
  prenup: [
    {
      name: "HelloPrenup",
      initial: "H",
      color: "#8A5A2B",
      category: "Legal documents",
      categoryIcon: FileText,
      description: "Create a prenup online, attorney-reviewed, at a flat fee.",
      fit: "Direct match for this plan",
      url: "https://example.com/partners/helloprenup",
    },
    {
      name: "Trust & Will",
      initial: "T",
      color: "#2C4A6B",
      category: "Estate documents",
      categoryIcon: FileText,
      description: "Wills and trusts set up online in under an hour.",
      fit: "Covers the broader estate step",
      url: "https://example.com/partners/trust-will",
    },
  ],
};

// The single hero partner for a domain (null if none configured).
export function heroPartner(domain: string): Partner | null {
  return PARTNERS[domain]?.[0] ?? null;
}
