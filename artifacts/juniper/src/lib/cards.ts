import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

// Client seam for the card-rewards surface on /app/credit (issue #168): which
// card each linked account is, what each one earns, what the wrong card is
// costing, and the benefits checklist.
//
// ONE FETCH, because the server computes all of it in one place (api/_rewards.ts,
// pure, checked by scripts/src/check-rewards.ts). Nothing in this file does
// rewards arithmetic. That is deliberate: a second implementation on the client
// would be a second answer to "what is this worth a year", free to disagree with
// the one the check script proves, and the disagreement would surface as two
// different dollar figures on one page.
//
// Not part of the `lib/finances.ts` seam, for the reason the Credit page already
// documents at its own head: the /api/finances account rollup carries name,
// institution and balance only, and this surface needs each card's `limit` and
// per-ACCOUNT spend. Same standing exception, widened by one endpoint.

/** How an earn rate is written on the issuer's page. */
export type CardRateDisplay = string;

export interface CardProductSummary {
  id: string;
  name: string;
  issuer: string;
  network: string | null;
  annual_fee: number;
  brand_color: string | null;
  rewards_currency: string;
  point_value_cents: number | null;
  source_url: string;
  as_of: string;
  verified: boolean;
}

export interface LinkedCard {
  plaid_account_id: string;
  /** Plaid's id for the issuer, so the brand map (keyed by id) can be read
      directly rather than matched on a display name. */
  institution_id: string | null;
  institution: string;
  account_name: string;
  mask: string | null;
  balance: number;
  /** The effective limit: the bank's where it reports one, otherwise the
      member's. Prefer `bankLimit`/`memberLimit` when the DISTINCTION matters,
      which on this surface is most of the time. */
  limit: number | null;
  /** What the bank reports, or null when it reports nothing. A fact. */
  bank_limit: number | null;
  /** What the member typed for a card the bank reports no limit for (#211).
      A claim, and drawn as one: never rendered without its badge. */
  member_limit: number | null;
  member_limit_set_at: string | null;
  currency: string | null;
  /** True once the member has answered WHICH PRODUCT this is, including the
      answer "not in your catalog". Not the same as a row existing: since #211 a
      row can exist purely to hold a limit. */
  answered: boolean;
  product: CardProductSummary | null;
}

/** Where a card's usable limit came from, which the surface must always say. */
export type LimitSource = "bank" | "member" | "none";

/**
 * The one place that decides which limit a card uses.
 *
 * The member's answer wins, and it can only exist for a card the bank reports
 * nothing for, so in practice the two never compete. Written as an explicit
 * precedence anyway rather than left to `??`, because if an issuer ever starts
 * reporting a limit for a card the member had already answered for, the BANK's
 * number should take over: it is the fact, and theirs was a stand-in for its
 * absence.
 */
export function limitOf(card: { bank_limit: number | null; member_limit: number | null }):
  { limit: number | null; source: LimitSource } {
  if (card.bank_limit != null && card.bank_limit > 0) return { limit: card.bank_limit, source: "bank" };
  if (card.member_limit != null && card.member_limit > 0) return { limit: card.member_limit, source: "member" };
  return { limit: null, source: "none" };
}

export interface Candidate {
  product_id: string;
  name: string;
  issuer: string;
  annual_fee: number;
  rewards_currency: string;
  brand_color: string | null;
  /** Orders the picker. Never a threshold that skips the member's tap. */
  confidence: number;
}

export interface UnidentifiedCard {
  plaid_account_id: string;
  institution_id: string | null;
  institution: string;
  account_name: string;
  mask: string | null;
  balance: number;
  limit: number | null;
  currency: string | null;
  candidates: Candidate[];
}

export interface GuideCardRef {
  productId: string;
  productName: string;
  display: CardRateDisplay;
  brandColor: string | null;
}

export interface GuideEntry {
  categoryId: string;
  categoryLabel: string;
  monthlySpend: number;
  /** True when any rate in this row needed the house cents-per-point figure.
      Rendered as a visible caveat, never dropped. */
  assumesPointValue: boolean;
  best: (GuideCardRef & {
    pct: number;
    note: string | null;
    cap: string | null;
    assumesPointValue: boolean;
  }) | null;
  /** Cards matching the winner's rate exactly. A tie means it genuinely does not
      matter which one they reach for, which is a different instruction. */
  tied: GuideCardRef[];
  others: GuideCardRef[];
}

export interface SwitchIdea {
  categoryId: string;
  categoryLabel: string;
  annualSpend: number;
  from: { productId: string; productName: string; display: CardRateDisplay; plaidAccountId: string };
  to: { productId: string; productName: string; display: CardRateDisplay; note: string | null; cap: string | null };
  gain: number;
  assumesPointValue: boolean;
}

export interface UpgradeIdea {
  productId: string;
  productName: string;
  issuer: string;
  annualFee: number;
  wins: { categoryId: string; categoryLabel: string; display: CardRateDisplay; gain: number }[];
  grossGain: number;
  netGain: number;
  assumesPointValue: boolean;
}

export type BenefitPeriod = "month" | "quarter" | "year" | "once";

export interface TrackedBenefit {
  id: string;
  product_id: string;
  productName: string;
  group: string;
  name: string;
  detail: string | null;
  value_amount: number | null;
  period: BenefitPeriod | null;
  periodKey: string;
  used: boolean;
  usedAt: string | null;
}

export interface BenefitSummary {
  total: number;
  usedCount: number;
  /** Annualized value of the unused, dollar-valued benefits. */
  unusedValue: number;
  /** True when at least one benefit has no dollar figure, so the total above is
      partial and has to be presented as such. */
  valuePartial: boolean;
  groups: { group: string; benefits: TrackedBenefit[]; usedCount: number }[];
}

export interface CardRewards {
  linked: boolean;
  cards: LinkedCard[];
  unidentified: UnidentifiedCard[];
  guide: GuideEntry[];
  switches: SwitchIdea[];
  upgrades: UpgradeIdea[];
  benefits: BenefitSummary | null;
  provenance: {
    anyUnverified: boolean;
    asOf: string | null;
    assumesPointValue: boolean;
    periods: { month: string; quarter: string; year: string };
  };
  catalog: { product_id: string; name: string; issuer: string; annual_fee: number;
             rewards_currency: string; brand_color: string | null;
             point_value_cents: number | null }[];
}

/**
 * product id -> cents per point, for the disclosure chip.
 *
 * Built from the catalog rather than from `cards`, because the upgrade rows name
 * products the member does NOT hold and those never appear in `cards`. One map
 * covers both, which is why the endpoint carries the valuation on catalog rows.
 */
export function pointValueMap(data: CardRewards): Map<string, number | null> {
  return new Map(data.catalog.map((p) => [p.product_id, p.point_value_cents]));
}

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function fetchCardRewards(): Promise<CardRewards | null> {
  try {
    const r = await authedFetch("/api/card-rewards");
    if (!r.ok) return null;
    return (await r.json()) as CardRewards;
  } catch {
    return null;
  }
}

/**
 * Record which product a linked account is. `productId` of null is the member
 * saying "my card is not in your catalog", which is a real answer and stops them
 * being asked again.
 */
export async function confirmCard(plaidAccountId: string, productId: string | null): Promise<boolean> {
  try {
    const r = await authedFetch("/api/member-cards", {
      method: "POST",
      body: JSON.stringify({ plaid_account_id: plaidAccountId, product_id: productId }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Set the credit limit for a card whose bank does not report one (#211), or clear
 * it by passing null.
 *
 * Accepts what somebody reads off a statement, commas and a dollar sign
 * included; the server does the parsing so there is one definition of what
 * counts as a number rather than a client regex and a server regex that drift.
 *
 * This never reaches the Juniper Score. See the comment in
 * api/_finance-snapshot.ts, which deliberately reads bank-reported limits only.
 */
export async function setCardLimit(plaidAccountId: string, creditLimit: string | null): Promise<boolean> {
  try {
    const r = await authedFetch("/api/member-cards", {
      method: "PATCH",
      body: JSON.stringify({ plaid_account_id: plaidAccountId, credit_limit: creditLimit }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Undo an answer, so the account goes back into the identify queue. */
export async function forgetCard(plaidAccountId: string): Promise<boolean> {
  try {
    const r = await authedFetch(`/api/member-cards?account=${encodeURIComponent(plaidAccountId)}`,
      { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Tick a benefit off, or clear it.
 *
 * The PERIOD is not sent and cannot be: the server derives it from the benefit's
 * own stored period and its own clock, so a client cannot tick a period that has
 * not happened yet. See the header of api/card-benefits.ts.
 */
export async function setBenefitUsed(benefitId: string, used: boolean): Promise<boolean> {
  try {
    const r = used
      ? await authedFetch("/api/card-benefits", { method: "POST", body: JSON.stringify({ benefit_id: benefitId }) })
      : await authedFetch(`/api/card-benefits?benefit=${encodeURIComponent(benefitId)}`, { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}

export interface CardRewardsValue {
  data: CardRewards | null;
  loading: boolean;
  /** Re-read the endpoint. Every write calls it rather than patching state:
      confirming one card changes the guide, the switch ideas, the upgrade list
      and the benefit set all at once, so a local patch would be a second, worse
      implementation of the whole server computation. */
  refresh: () => Promise<void>;
}

export function useCardRewards(): CardRewardsValue {
  const [data, setData] = useState<CardRewards | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchCardRewards();
    setData(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchCardRewards();
      if (!cancelled) { setData(next); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, refresh: load };
}

// ── Formatting, shared by the components below ─────────────────────────────

export const money0 = (n: number, currency: string | null = "USD"): string => {
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
};

/** A date as a member would read it, from the yyyy-mm-dd the catalog stores.
    Parsed as UTC deliberately: `new Date("2026-08-31")` is already UTC midnight,
    and formatting it in local time can render the day before. */
export const readableDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("en-US",
    { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

/** What to call the bucket a benefit's tick is recorded against. */
export const periodWord = (period: BenefitPeriod | null): string | null => {
  if (period === "month") return "Month";
  if (period === "quarter") return "Quarter";
  if (period === "year") return "Year";
  return null;
};
