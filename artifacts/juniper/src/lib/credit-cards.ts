// One projection of the member's credit cards, and one utilization figure over
// them, shared by the Credit page and the Overview widget that summarizes it.
//
// ── WHY THIS IS A MODULE AND NOT TWO COPIES ────────────────────────────────
//
// The Overview widget is a shorter version of what the Credit page draws, which
// is exactly the arrangement that produces two answers to one question: the
// same bug the shared "Together" total had (a figure derived apart from the list
// it sat above, which drifted all the way to zero), and the same rule the card
// holder had to satisfy. A summary and its full page may be redundant. They may
// not contradict. So both read these functions and neither computes a
// percentage of its own.
//
// Moved here from pages/app/credit.tsx unchanged, comments included, because
// every one of them records a decision that is still load-bearing.

import { limitOf, type ManualCard } from "@/lib/cards";
import { creditPosition, utilizationPct } from "@/lib/credit-balance";
import type { PlaidItem } from "@/lib/plaid";

export type CardOrigin = "linked" | "manual";

export type CreditCardRow = {
  key: string;
  // Where the row came from, and it changes what the row is allowed to offer. A
  // hand-entered card (migration 0046) has no Plaid account behind it, so it can
  // never be identified, never has rates, and its limit is edited on Connections
  // rather than inline. Kept as a discriminator rather than inferred from
  // `institutionId == null`, which would be true of a linked account whose item
  // predates the institution-id passthrough.
  origin: CardOrigin;
  // Plaid's id for the issuer, so the brand map (keyed by id) can be read
  // directly rather than matched on a display name.
  institutionId: string | null;
  institution: string;
  name: string;
  mask: string | null;
  // What the member OWES. Plaid reports a credit balance as positive when owed
  // and negative when the account is in credit, and taking the magnitude of it
  // drew "the issuer owes you $328" as "you owe $328". See lib/credit-balance.
  balance: number;
  // What the ISSUER owes the member: an overpayment, or a refund that landed
  // after the statement cleared. Kept apart from `balance` because the row has
  // to be able to say which of the two it is drawing.
  inCredit: number;
  // null whenever the bank does not report a limit. This is the BANK's number:
  // a fact.
  limit: number | null;
  // #211: what the MEMBER typed for a card the bank reports no limit for. A
  // claim, kept in its own field rather than folded into `limit`, because every
  // surface that draws it has to be able to say which of the two it drew.
  memberLimit: number | null;
  currency: string | null;
};

// Credit accounts are `type === "credit"` in Plaid's taxonomy (cards plus the odd
// line of credit). Loans are a separate type and belong to the debt surfaces, not
// to a utilization calculation.
export function linkedCards(items: PlaidItem[]): CreditCardRow[] {
  return items.flatMap((it) =>
    (it.accounts ?? [])
      .filter((a) => (a.type ?? "").toLowerCase() === "credit")
      .map((a) => ({
        key: a.account_id,
        origin: "linked" as const,
        institutionId: it.institution_id ?? null,
        institution: it.institution_name || "Linked institution",
        name: a.name,
        mask: a.mask,
        balance: creditPosition(a.balance).owed,
        inCredit: creditPosition(a.balance).inCredit,
        limit: a.limit != null && a.limit > 0 ? a.limit : null,
        // Filled in by the caller from /api/card-rewards, which is the only
        // reader of member_cards. This function stays a pure projection of the
        // Plaid snapshot.
        memberLimit: null,
        currency: a.currency,
      })),
  );
}

// The same row shape, from the cards the member entered by hand (migration 0046),
// so one list and one utilization sum cover both. A manual card has no bank
// behind it, so `limit` (the bank's number) is null by construction and the
// member's own figure is the only one there is.
export function manualCards(list: ManualCard[]): CreditCardRow[] {
  return list.map((m) => ({
    // Prefixed, because a manual account id and a Plaid account id are different
    // namespaces and React needs one key space across the merged list.
    key: `manual:${m.manual_account_id}`,
    origin: "manual" as const,
    // Nothing to look a brand mark up by: a hand-typed institution name is not
    // Plaid's institution id, and guessing one from the name is how you end up
    // drawing the Chase logo on somebody's local credit union.
    institutionId: null,
    institution: m.institution,
    name: m.account_name,
    mask: m.mask,
    balance: m.balance,
    inCredit: m.inCredit,
    limit: null,
    memberLimit: m.limit,
    currency: m.currency,
  }));
}

// Which limit a card actually uses, and where it came from. Delegates to
// `limitOf` in lib/cards.ts so the precedence is defined once: the BANK's number
// wins where it exists, because it is the fact and the member's was a stand-in
// for its absence.
export const limitFor = (c: CreditCardRow) =>
  limitOf({ bank_limit: c.limit, member_limit: c.memberLimit });

export interface UtilizationSummary {
  /** Cards counted, which is cards with a limit and nothing else. */
  counted: number;
  /** Cards left out for having no limit, stated wherever the figure is drawn. */
  excluded: number;
  /** How many of the counted limits the member supplied rather than their bank. */
  memberSet: number;
  balance: number;
  limit: number;
  used: number;
  currency: string | null;
}

/**
 * The overall utilization figure, or null when no card has a limit to measure
 * against.
 *
 * Only cards with a known limit can be part of it. Folding in a card with an
 * unknown limit either understates the ratio (limit treated as 0 and dropped
 * from the denominator) or invents one, so it is excluded and the exclusion is
 * counted so every caller can state it.
 *
 * `memberSet` rides along for the same reason (#211, 0046): a percentage built
 * partly from numbers somebody typed is only as good as what they typed, and a
 * member who has forgotten they set one would otherwise have no way to know this
 * figure rests on it. Every surface that draws `used` must draw this too.
 */
export function utilizationSummary(cards: CreditCardRow[]): UtilizationSummary | null {
  const rated = cards.map((c) => ({ card: c, ...limitFor(c) }));
  const withLimit = rated.filter((r) => r.limit != null);
  if (!withLimit.length) return null;
  const balance = withLimit.reduce((a, r) => a + r.card.balance, 0);
  const limit = withLimit.reduce((a, r) => a + (r.limit ?? 0), 0);
  return {
    counted: withLimit.length,
    excluded: cards.length - withLimit.length,
    memberSet: withLimit.filter((r) => r.source === "member").length,
    balance,
    limit,
    // Clamped and null-safe in one place; see lib/credit-balance.ts.
    used: utilizationPct(balance, limit) ?? 0,
    currency: withLimit[0].card.currency,
  };
}
