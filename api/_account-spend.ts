// Per-account, per-category spend: one aggregation, shared by api/card-rewards.ts
// (which annualizes it into the earning guide) and api/finances.ts (issue #289,
// item 5: widen the rollup with per-account spend). Pure, so the two callers
// cannot compute a different answer to "how much did this account spend in this
// category" from the same rows.
//
// I/O stays with each caller rather than living here, deliberately: card-rewards.ts
// already fetches its transactions for a different reason too (merchant_name, for
// benefit auto-matching), so a shared fetch function would either duplicate that
// query or force this module to know about a field it does not use. Each caller
// reads its own rows over the window that makes sense for it and hands them here.

import type { AccountCategorySpend } from "./_rewards";
export type { AccountCategorySpend };

export interface SpendTxnRow {
  account_id: string | null;
  amount: number;
  date: string;
  category: string | null;
  category_id: string | null;
}

/** Same shape a member's resolved `Taxonomy.classify` returns (api/_categorize.ts),
    named structurally here so this module does not have to import the taxonomy
    type just to describe the one method it calls. */
export type ClassifyFn = (categoryId: string | null, category: string | null) =>
  { c: string; g: string; k: "spend" | "income" | "transfer"; e: string };

/**
 * Per-account, per-category spend, transfers and income excluded and spend
 * summed SIGNED, the same three rules /api/finances's own cashflow section
 * applies: a card payment is not a purchase, and counting it would recommend a
 * card for paying off a card; a refund nets against the category it came back
 * to instead of masquerading as income.
 *
 * `spendDates` rides along because the caller needing an annualized figure
 * (api/card-rewards.ts, via `coveredDays`) needs the actual history spanned,
 * never an assumed 90 days -- the bug _finance-snapshot.ts already had once.
 */
export function accountCategorySpend(
  txns: SpendTxnRow[],
  classify: ClassifyFn,
  categoryIdOf: (label: string | null) => string | null,
): { spend: AccountCategorySpend[]; spendDates: string[] } {
  const spendMap = new Map<string, AccountCategorySpend>();
  const spendDates: string[] = [];
  for (const t of txns) {
    if (!t.account_id) continue;
    const cls = classify(t.category_id, t.category);
    if (cls.k !== "spend") continue;
    spendDates.push(t.date);
    const categoryId = t.category_id || categoryIdOf(t.category);
    if (!categoryId) continue; // an unrecognized label gets no id, and no guess
    const key = `${t.account_id}|${categoryId}`;
    const prev = spendMap.get(key);
    if (prev) prev.amount += t.amount;
    else spendMap.set(key, {
      plaid_account_id: t.account_id, category_id: categoryId,
      category_label: cls.c, amount: t.amount,
    });
  }
  return { spend: [...spendMap.values()], spendDates };
}
