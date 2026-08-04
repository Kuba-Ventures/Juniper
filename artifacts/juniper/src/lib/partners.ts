// Affiliate / marketplace listing config, keyed by plan domain.
// ------------------------------------------------------------------
// Config-first on purpose: offers are few and change rarely, so this avoids a
// migration. If we later want to swap offers without deploying (or accept
// real self-serve merchant listings), migrate to a Supabase `partners` table
// (remember: new tables need GRANT SELECT TO authenticated + an RLS read
// policy or they silently 401).
//
// Every `url` below is a PLACEHOLDER (example.com). Swap for an approved
// affiliate link before launch. Regulated categories (mortgage, insurance,
// credit cards, legal) may need specific disclosures/licensing before going
// live. Nothing monetized should flip live until the affiliate
// compliance/licensing item is cleared.
//
// The first entry per domain is the featured hero (the affiliate-card at the
// top of a completed plan). The full list powers the marketplace surface.
//
// Recommendation mapping is deterministic by domain, no LLM/synthesis change.

import {
  PiggyBank,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  FileText,
  Landmark,
  Home,
  GraduationCap,
  Calculator,
  type LucideIcon,
} from "lucide-react";

// Where a listing came from. `curated` = we vetted/hand-picked it.
// `scraped` = seeded from public listings to bootstrap the marketplace before
// real integrations (DoorDash-style). `self-listed` = a real merchant listed
// themselves (deferred; the flag exists now so seeds and future rows coexist).
export type PartnerSource = "curated" | "scraped" | "self-listed";

export type Partner = {
  name: string;
  initial: string; // monogram stand-in for a real logo asset
  color: string; // logo-tile background
  category: string; // e.g. "High-yield savings"
  categoryIcon: LucideIcon; // badge icon on the logo tile
  description: string; // fuller line used on the featured hero card
  fit: string; // the "Why this: …" line on the hero card
  blurb: string; // short one-liner shown on a marketplace listing card
  tags?: string[]; // optional facets for the marketplace (e.g. "No fees")
  source: PartnerSource; // defaults conceptually to "curated"; set explicitly
  url: string; // PLACEHOLDER referral URL (example.com)
  // Real brand logo via a live favicon service (Google s2). Demo-quality; the
  // monogram tile is the automatic fallback if it fails to load. Swap for a
  // hosted/inlined asset once affiliate partners are approved.
  logoUrl?: string;
};

// The first entry per domain is the hero (featured, RECOMMENDED). The rest are
// seeded marketplace listings so the surface reads like a marketplace, not a
// single link. Every url stays a placeholder until compliance clears.
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
      blurb: "No-fee high-yield savings for your down payment.",
      tags: ["No fees", "High-yield"],
      source: "curated",
      url: "https://example.com/partners/sofi-savings",
      logoUrl: "https://www.google.com/s2/favicons?domain=sofi.com&sz=128",
    },
    {
      name: "Marcus by Goldman Sachs",
      initial: "M",
      color: "#3B3B3B",
      category: "High-yield savings",
      categoryIcon: PiggyBank,
      description: "Simple high-yield savings, no minimums or fees.",
      fit: "Alternative with no minimum balance",
      blurb: "High-yield savings with no minimums.",
      tags: ["No minimum"],
      source: "curated",
      url: "https://example.com/partners/marcus",
      logoUrl: "https://www.google.com/s2/favicons?domain=marcus.com&sz=128",
    },
    {
      name: "Better Mortgage",
      initial: "B",
      color: "#1A7A5A",
      category: "Mortgage & pre-approval",
      categoryIcon: Landmark,
      description: "Fully digital mortgage with fast pre-approval and no lender fees.",
      fit: "Get pre-approved before you shop",
      blurb: "Digital mortgage and quick pre-approval.",
      tags: ["Pre-approval", "Online"],
      source: "scraped",
      url: "https://example.com/partners/better-mortgage",
      logoUrl: "https://www.google.com/s2/favicons?domain=better.com&sz=128",
    },
    {
      name: "Rocket Mortgage",
      initial: "R",
      color: "#C8102E",
      category: "Mortgage & pre-approval",
      categoryIcon: Landmark,
      description: "Well-known online lender with a guided application flow.",
      fit: "Compare rates on a second quote",
      blurb: "Compare mortgage rates online.",
      tags: ["Rates"],
      source: "scraped",
      url: "https://example.com/partners/rocket-mortgage",
      logoUrl: "https://www.google.com/s2/favicons?domain=rocketmortgage.com&sz=128",
    },
    {
      name: "Redfin",
      initial: "R",
      color: "#A02021",
      category: "Home search & agents",
      categoryIcon: Home,
      description: "Browse listings and connect with local buyer's agents.",
      fit: "Find homes in your price range",
      blurb: "Browse homes and find a local agent.",
      tags: ["Listings", "Agents"],
      source: "scraped",
      url: "https://example.com/partners/redfin",
      logoUrl: "https://www.google.com/s2/favicons?domain=redfin.com&sz=128",
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
      blurb: "Shared budgeting built for couples.",
      tags: ["Couples", "Budgeting"],
      source: "curated",
      url: "https://example.com/partners/monarch",
      logoUrl: "https://www.google.com/s2/favicons?domain=monarchmoney.com&sz=128",
    },
    {
      name: "YNAB",
      initial: "Y",
      color: "#2E7CD6",
      category: "Budgeting & net worth",
      categoryIcon: TrendingUp,
      description: "Zero-based budgeting to give every shared dollar a job.",
      fit: "Hands-on method for aligning spending",
      blurb: "Give every shared dollar a job.",
      tags: ["Budgeting", "Method"],
      source: "scraped",
      url: "https://example.com/partners/ynab",
      logoUrl: "https://www.google.com/s2/favicons?domain=ynab.com&sz=128",
    },
    {
      name: "Empower",
      initial: "E",
      color: "#12508C",
      category: "Net worth & investing",
      categoryIcon: TrendingUp,
      description: "Track combined net worth and investment accounts in one dashboard.",
      fit: "See your joint net worth over time",
      blurb: "Free net-worth and investment tracking.",
      tags: ["Net worth", "Free"],
      source: "scraped",
      url: "https://example.com/partners/empower",
      logoUrl: "https://www.google.com/s2/favicons?domain=empower.com&sz=128",
    },
    {
      name: "Ally Bank",
      initial: "A",
      color: "#6B1F7B",
      category: "Joint banking",
      categoryIcon: PiggyBank,
      description: "Joint high-yield checking and savings with shared buckets.",
      fit: "Open a shared account together",
      blurb: "Joint high-yield checking and savings.",
      tags: ["Joint", "High-yield"],
      source: "scraped",
      url: "https://example.com/partners/ally",
      logoUrl: "https://www.google.com/s2/favicons?domain=ally.com&sz=128",
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
      blurb: "0% intro-APR cards to consolidate debt.",
      tags: ["0% APR", "Consolidate"],
      source: "curated",
      url: "https://example.com/partners/balance-transfer",
    },
    {
      name: "SoFi Personal Loan",
      initial: "S",
      color: "#1E3A5F",
      category: "Debt consolidation",
      categoryIcon: Landmark,
      description: "Fixed-rate consolidation loan to replace variable card APRs.",
      fit: "Lock a fixed rate on your balance",
      blurb: "Fixed-rate loan to consolidate cards.",
      tags: ["Fixed rate", "Consolidate"],
      source: "scraped",
      url: "https://example.com/partners/sofi-loan",
      logoUrl: "https://www.google.com/s2/favicons?domain=sofi.com&sz=128",
    },
    {
      name: "Undebt.it",
      initial: "U",
      color: "#2C7A4B",
      category: "Payoff planner",
      categoryIcon: Calculator,
      description: "Free snowball and avalanche payoff planner and tracker.",
      fit: "Model your payoff order for free",
      blurb: "Free snowball / avalanche payoff planner.",
      tags: ["Free", "Planner"],
      source: "scraped",
      url: "https://example.com/partners/undebt-it",
      logoUrl: "https://www.google.com/s2/favicons?domain=undebt.it&sz=128",
    },
    {
      name: "Tally",
      initial: "T",
      color: "#E0533D",
      category: "Automated payoff",
      categoryIcon: CreditCard,
      description: "Automates credit-card payments to knock out high-APR balances first.",
      fit: "Automate the avalanche method",
      blurb: "Automated credit-card payoff.",
      tags: ["Automated"],
      source: "scraped",
      url: "https://example.com/partners/tally",
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
      blurb: "Compare term life quotes fast.",
      tags: ["Compare", "Term life"],
      source: "curated",
      url: "https://example.com/partners/policygenius",
      logoUrl: "https://www.google.com/s2/favicons?domain=policygenius.com&sz=128",
    },
    {
      name: "Ladder",
      initial: "L",
      color: "#1F6F63",
      category: "Term life insurance",
      categoryIcon: ShieldCheck,
      description: "Flexible term life you can adjust as your family grows.",
      fit: "Coverage you can scale later",
      blurb: "Flexible term life you can adjust.",
      tags: ["Term life", "Flexible"],
      source: "curated",
      url: "https://example.com/partners/ladder",
      logoUrl: "https://www.google.com/s2/favicons?domain=ladderlife.com&sz=128",
    },
    {
      name: "Ethos",
      initial: "E",
      color: "#0B7D6E",
      category: "Term life insurance",
      categoryIcon: ShieldCheck,
      description: "No-medical-exam term life with a fast online application.",
      fit: "Coverage without a medical exam",
      blurb: "No-exam term life, quick approval.",
      tags: ["No exam", "Term life"],
      source: "scraped",
      url: "https://example.com/partners/ethos",
      logoUrl: "https://www.google.com/s2/favicons?domain=ethoslife.com&sz=128",
    },
    {
      name: "Backer 529",
      initial: "B",
      color: "#3457B2",
      category: "College savings",
      categoryIcon: GraduationCap,
      description: "Open a 529 college-savings plan and invite family to chip in.",
      fit: "Start the college fund early",
      blurb: "529 college savings, family can contribute.",
      tags: ["529", "College"],
      source: "scraped",
      url: "https://example.com/partners/backer-529",
      logoUrl: "https://www.google.com/s2/favicons?domain=backer.com&sz=128",
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
      blurb: "Attorney-reviewed prenup online, flat fee.",
      tags: ["Flat fee", "Attorney-reviewed"],
      source: "curated",
      url: "https://example.com/partners/helloprenup",
      logoUrl: "https://www.google.com/s2/favicons?domain=helloprenup.com&sz=128",
    },
    {
      name: "Trust & Will",
      initial: "T",
      color: "#2C4A6B",
      category: "Estate documents",
      categoryIcon: FileText,
      description: "Wills and trusts set up online in under an hour.",
      fit: "Covers the broader estate step",
      blurb: "Wills and trusts, set up online.",
      tags: ["Wills", "Trusts"],
      source: "curated",
      url: "https://example.com/partners/trust-will",
      logoUrl: "https://www.google.com/s2/favicons?domain=trustandwill.com&sz=128",
    },
    {
      name: "Rocket Lawyer",
      initial: "R",
      color: "#C8102E",
      category: "Legal documents",
      categoryIcon: FileText,
      description: "On-demand legal documents plus access to attorneys by subscription.",
      fit: "Talk to an attorney about your framework",
      blurb: "Legal docs plus on-demand attorney access.",
      tags: ["Attorneys", "Documents"],
      source: "scraped",
      url: "https://example.com/partners/rocket-lawyer",
      logoUrl: "https://www.google.com/s2/favicons?domain=rocketlawyer.com&sz=128",
    },
    {
      name: "LegalZoom",
      initial: "L",
      color: "#0B7C4A",
      category: "Legal documents",
      categoryIcon: FileText,
      description: "Prenups, wills, and other legal documents with guided setup.",
      fit: "One place for related legal docs",
      blurb: "Prenups, wills, and more with guided setup.",
      tags: ["Documents"],
      source: "scraped",
      url: "https://example.com/partners/legalzoom",
      logoUrl: "https://www.google.com/s2/favicons?domain=legalzoom.com&sz=128",
    },
  ],
};

// The single hero partner for a domain (null if none configured).
export function heroPartner(domain: string): Partner | null {
  return PARTNERS[domain]?.[0] ?? null;
}

// All configured partners/listings for a domain, hero first. The first entry
// is the RECOMMENDED (featured) one.
export function partnersForDomain(domain: string): Partner[] {
  return PARTNERS[domain] ?? [];
}
