// "Picked for you", personalized marketplace recommendations (Stage 5).
//
// Pure and I/O-free: given the member's financial signals and the available
// catalog, it produces a short, ranked list of offers, each with a concrete
// reason drawn from the member's own numbers. Matching is deterministic and
// based on FIT (does this offer address a real gap?), never on payout, the
// catalog it receives is already benefit-ranked, so "best offer in the category
// that fits" falls out naturally.
import type { Offer } from "./_offers";
import type { PickSignals } from "./_finance-snapshot";

export interface Pick {
  name: string;
  category: string;
  headline: string;
  blurb: string;
  tags: string[];
  url: string;
  source: Offer["source"];
  reason: string;   // the personalized "Because …" line
  priority: number; // lower = more urgent (for ordering)
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// Each rule tests a signal, targets a catalog category (optionally biased toward
// a tag), and writes a reason from the member's numbers. Priority orders the
// final list; the tag hint disambiguates when a category has several offers
// (e.g. Debt has both a balance transfer and a student refi).
interface Rule {
  test: (s: PickSignals) => boolean;
  category: string;
  tagHint?: string;
  reason: (s: PickSignals) => string;
  priority: number;
}

const RULES: Rule[] = [
  {
    test: (s) => s.cardDebt >= 500,
    category: "Debt", tagHint: "Balance transfer", priority: 1,
    reason: (s) => `you're carrying ${money(s.cardDebt)} in credit-card debt, a 0% balance transfer could cut the interest`,
  },
  {
    // Idle cash: at least a full extra month of spending sitting beyond a healthy
    // ~3-month buffer, enough to be worth moving to yield (avoids nagging on small
    // amounts, so a genuinely-set member gets the clean "all set" empty state).
    test: (s) => s.monthlySpending > 0 && s.cashReserves >= s.monthlySpending * 4,
    category: "Saving", priority: 2,
    reason: (s) => `${money(s.cashReserves - s.monthlySpending * 3)} beyond your safety net is sitting in low-yield cash`,
  },
  {
    // Thin emergency fund, a high-yield account helps build it.
    test: (s) => s.monthlySpending > 0 && s.emergencyMonths < 3 && s.cashReserves <= s.monthlySpending * 3,
    category: "Saving", priority: 2,
    reason: (s) => `your savings cover about ${s.emergencyMonths.toFixed(1)} months, a high-yield account helps you build a safety net`,
  },
  {
    test: (s) => s.loanDebt >= 1000,
    category: "Debt", tagHint: "Student refi", priority: 3,
    reason: (s) => `you have ${money(s.loanDebt)} in loans that may be refinanceable at a lower rate`,
  },
  {
    test: (s) => s.annualIncome > 0 && s.investmentBalance < s.annualIncome * 0.5,
    category: "Investing", priority: 4,
    reason: (s) => `you've invested about ${(s.investmentBalance / s.annualIncome).toFixed(1)}× your income, automated investing can keep you on pace`,
  },
];

export function computePicks(signals: PickSignals, catalog: Offer[], limit = 3): Pick[] {
  const used = new Set<string>(); // partner names already picked
  const picks: Pick[] = [];

  for (const rule of RULES) {
    if (!rule.test(signals)) continue;
    // Catalog is pre-ranked by user benefit; take the first fitting, unused offer,
    // preferring one whose tags match the hint.
    const inCat = catalog.filter((o) => o.category === rule.category && !used.has(o.name));
    const offer =
      (rule.tagHint && inCat.find((o) => (o.tags || []).some((t) => t.toLowerCase().includes(rule.tagHint!.toLowerCase())))) ||
      inCat[0];
    if (!offer) continue;
    used.add(offer.name);
    picks.push({
      name: offer.name,
      category: offer.category,
      headline: offer.headline || "",
      blurb: offer.blurb || "",
      tags: offer.tags || [],
      url: offer.url,
      source: offer.source,
      reason: rule.reason(signals),
      priority: rule.priority,
    });
  }

  return picks.sort((a, b) => a.priority - b.priority).slice(0, limit);
}
