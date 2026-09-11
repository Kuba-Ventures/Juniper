// Shared assembly of the Juniper Score inputs from a user's Stage-3 data, so the
// read endpoint (/api/finances) and the history writer (/api/score/compute)
// score off exactly the same numbers. Fetches with the service-role key and
// scopes by user_id itself (RLS is bypassed here, see _supabase-admin).
import { adminRest } from "./_supabase-admin";
import { fetchManualAccounts, sumManualAccounts } from "./_manual-accounts";
import { taxonomyFor } from "./_taxonomy";
import { creditPosition } from "./_credit-balance";
import { planProgressByFactor, type PlanRow } from "./_plan-progress";
import type { ScoreInput } from "./_score";

type Txn = { amount: number; date: string; category: string | null; category_id: string | null };
// `limit` is the card's credit line, persisted into the stored snapshot by
// sanitizeAccounts. Present on most cards, null on plenty of them, which is why
// utilization below is computed only across the cards that report one.
type Acct = { type: string | null; balance: number | null; limit?: number | null };
type Item = { accounts: Acct[] };
// The member's own hand-entered figures, from the onboarding money snapshot and
// the Overview nudge (both write through /api/profile, columns from migration
// 0001). Read here because a saved figure is a figure: see the header of
// `savedInputs` below for the bug that came of ignoring them.
type ProfileRow = {
  monthly_income: number | null;
  monthly_expenses: number | null;
  total_savings: number | null;
  total_debt: number | null;
};

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

// How far back to ask for transactions. A trailing window keeps the score stable
// across a partial current month.
export const WINDOW_DAYS = 90;

// The shortest span this will treat as representative. Below it the monthly
// figures are still an extrapolation, but from a floor rather than from however
// few days happen to exist: a member who linked three days ago would otherwise
// have their weekend multiplied into a month. Two weeks is the point where a
// pay cycle and a rent payment are usually both inside the window.
const MIN_COVERED_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// How many days of history the transactions actually span, counting from the
// oldest one to today. This is the divisor the monthly averages need, and using
// the WINDOW length instead was a real bug: a member who linked three weeks ago
// had every monthly figure divided by three, which left their spending at a
// third of reality and therefore their emergency fund reading three times the
// months it covers, their investing pace three times the pace, and their debt
// load a third of the burden. Savings rate came out right by luck, being a ratio
// of two numbers that were both a third too small.
// EXPORTED for /api/card-rewards, which needs exactly this divisor for exactly
// this reason: it turns a member's observed category spend into an annual figure
// and then quotes a dollar recommendation off it, so a window that overstates
// the history overstates the advice. One definition, not two, because two copies
// of "how much history is there" is how they come to disagree.
export function coveredDays(dates: string[]): number {
  let oldest = Infinity;
  for (const d of dates) {
    const t = Date.parse(d);
    if (!Number.isNaN(t) && t < oldest) oldest = t;
  }
  if (!Number.isFinite(oldest)) return MIN_COVERED_DAYS;
  const spanned = Math.floor((Date.now() - oldest) / DAY_MS) + 1;
  return Math.min(WINDOW_DAYS, Math.max(MIN_COVERED_DAYS, spanned));
}

// Richer breakdown for personalized marketplace picks, separates the debt kinds
// and precomputes the ratios the pick rules read.
export interface PickSignals {
  monthlySpending: number;
  cashReserves: number;
  emergencyMonths: number;   // cashReserves / monthlySpending
  cardDebt: number;          // revolving (credit) balances
  loanDebt: number;          // installment (loan) balances
  investmentBalance: number;
  annualIncome: number;
}

// Which figures on `input` came from what the member TYPED rather than from an
// account or a transaction feed, so a caller that has to say where a number
// came from (the chat, above all) can say it instead of guessing.
export type EstimatedField = "monthlyIncome" | "monthlySpending" | "cashReserves" | "totalDebt";

export interface FinanceSnapshot {
  /** Real linked-account data behind these figures: a Plaid item AND a
      transaction feed. Unchanged meaning, because /api/recommendations gates
      its personalized picks on exactly that and nothing here should widen it. */
  linked: boolean;
  /**
   * Anything at all behind these figures: a linked item, a hand-entered
   * account, or the income/expenses the member saved. Use THIS, not `linked`,
   * to decide whether there is a member's own picture worth answering from.
   *
   * ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────
   *
   * This function used to return zeroes for everything the moment a member had
   * no Plaid item or no transactions, and /api/finances sends the score it
   * computes on ALL branches. So a member who typed $7,000 of income and
   * $4,000 of expenses, saw the dashboard's own "$3,000 saved" read back
   * correctly from those very figures, and then read a Juniper Score of 24
   * ("At risk") computed from an all-zero input: savings rate 0 and emergency
   * fund 0, because nothing here ever looked at what they had told us. 24 is
   * exactly what `computeScore(emptyInput())` returns, which is how a reported
   * symptom pinned itself to this line.
   */
  hasData: boolean;
  /** Non-empty when a figure on `input` is the member's own estimate. */
  estimated: EstimatedField[];
  input: ScoreInput;
  signals: PickSignals;
}

// UTC yyyy-mm-dd for `daysAgo` before now, without Date.now-in-a-loop concerns.
// Exported alongside coveredDays and WINDOW_DAYS so a second caller asks for the
// same window it later divides by.
export function isoDaysAgo(daysAgo: number): string {
  const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// A saved figure, or null when the member never gave one. Zero is a real
// answer (someone with no debt), so this tests the type rather than falsiness.
//
// WHY THIS IS NOT THE THING check-manual-limit-isolation.ts FORBIDS, since the
// two look alike and are opposites. That rule is about a member-typed CREDIT
// LIMIT, which is the DENOMINATOR of a ratio Juniper asserts from bank-reported
// facts: type a generous limit and your utilization, and therefore your score,
// improves on the strength of nothing. It stays excluded, and the shared
// manual-accounts select still does not even request the column.
//
// Income, expenses, savings and debt are the opposite case. They are the
// member's own account of their own life, they are the only figures a member
// with no linked bank has, and the client has ALWAYS scored them: see
// buildManualFinances in artifacts/juniper/src/lib/manual-finances.ts, which
// hands exactly these four to the same computeScore. Manual account balances
// have fed this function since tier 3 shipped, for the same reason. The bug
// was that the SERVER copy of the score ignored them, so the two engines
// answered differently about the same member, and the server's answer is the
// one that reaches the screen.
const saved = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export async function fetchScoreInput(uid: string): Promise<FinanceSnapshot> {
  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=accounts`);
  const since = isoDaysAgo(WINDOW_DAYS);
  const txns = await rows<Txn>(
    `transactions?user_id=eq.${uid}&date=gte.${since}&select=amount,date,category,category_id&limit=2000`,
  );
  // The member's own figures, from onboarding's money snapshot or the Overview
  // nudge. The dashboard has always read these (src/lib/manual-finances.ts
  // builds its cashflow card straight off them); this is the one place that
  // never did, which is the whole of the score bug documented on `hasData`.
  const profile = (
    await rows<ProfileRow>(
      `user_profiles?user_id=eq.${uid}&select=monthly_income,monthly_expenses,total_savings,total_debt&limit=1`,
    )
  )[0];
  const savedInputs = {
    monthlyIncome: saved(profile?.monthly_income),
    monthlySpending: saved(profile?.monthly_expenses),
    cashReserves: saved(profile?.total_savings),
    totalDebt: saved(profile?.total_debt),
  };
  // Read once, up here, because "does this member have anything at all" has to
  // see manual accounts too. Folded into the balances further down.
  const manualRows = await fetchManualAccounts(uid);

  // Unchanged: `linked` still means a Plaid item AND a transaction feed, which
  // is what /api/recommendations gates on.
  const linked = items.length > 0 && txns.length > 0;
  const hasData =
    linked ||
    items.length > 0 ||
    manualRows.length > 0 ||
    Object.values(savedInputs).some((v) => v !== null);

  // Genuinely nothing to say. Every caller renders an empty state off this
  // rather than a score built from zeroes. Plans are deliberately not part of
  // `hasData`: a plan with no other data behind it is a manual-layer member
  // (see src/lib/manual-finances.ts, which does fold in plan progress),
  // untouched by this early return either way.
  if (!hasData) {
    return { linked: false, hasData: false, estimated: [], input: emptyInput(), signals: emptySignals() };
  }

  // The member's own plans (issue #407), so a matching one's declared target
  // and saved-so-far can fold into the relevant score factor below. Owner-
  // scoped read, no partner rows: this is the caller's own declared progress,
  // not a shared plan's.
  const planRows = await rows<PlanRow>(`plans?user_id=eq.${uid}&select=domain,status,goal`);
  const planProgress = planProgressByFactor(planRows);

  // Plaid convention: positive amount = money out, negative = money in. But the
  // sign alone does not say whether money was CONSUMED, so this applies the same
  // three rules as /api/finances (see the cashflow block there): transfers and
  // credit-card payments are dropped, income is netted from its own categories,
  // and spending is summed signed so refunds reduce it. This matters more here
  // than on the dashboard, because these two numbers drive the savings rate and
  // the emergency-fund factor: counting transfers to savings as spending both
  // inflated the fund the member needs and hid the saving they were doing.
  const months = coveredDays(txns.map((t) => t.date)) / 30;
  // Resolved once for this member, not per row. Stage 2 of
  // docs/CUSTOM_CATEGORIES.md: these two numbers drive the score's savings rate
  // and emergency-fund factor, so the classification behind them is now the
  // member's own taxonomy rather than a module-level table.
  // Skipped entirely with no feed to classify, which is now a path that gets
  // this far: resolving a taxonomy to loop over zero rows is a round trip for
  // nothing.
  let outflow = 0, inflow = 0;
  if (txns.length) {
    const tax = await taxonomyFor(uid);
    for (const t of txns) {
      const kind = tax.classify(t.category_id, t.category).k;
      if (kind === "transfer") continue;
      if (kind === "income") inflow -= t.amount;
      else outflow += t.amount;
    }
  }
  const estimated: EstimatedField[] = [];
  // Measured beats saved, and saved beats nothing. A zero here means nothing
  // was OBSERVED (no feed at all, or a feed with no income categorized, which
  // is ordinary for the self-employed), so it is the case a member's own
  // figure should answer rather than a case worth reporting as fact. A
  // measured figure is never overwritten, so linking accounts still replaces
  // an estimate with the truth, and the precedence matches the dashboard's
  // own: /api/finances omits `cashflow` entirely with no transactions and the
  // client falls straight back to these same saved figures.
  const measure = (observed: number, fallback: number | null, field: EstimatedField): number => {
    if (observed > 0) return observed;
    if (fallback == null) return observed;
    estimated.push(field);
    return fallback;
  };
  const monthlySpending = measure(Math.max(0, outflow) / months, savedInputs.monthlySpending, "monthlySpending");
  const monthlyIncome = measure(Math.max(0, inflow) / months, savedInputs.monthlyIncome, "monthlyIncome");

  let cashReserves = 0, investmentBalance = 0, cardDebt = 0, loanDebt = 0;
  // Numerator and denominator of revolving utilization, accumulated together
  // across only the cards that report a limit so the ratio stays consistent: a
  // card with a balance and no limit would otherwise inflate it, and a card with
  // a limit and no balance is legitimately 0% of that line.
  //
  // BANK-REPORTED LIMITS ONLY, and this is load-bearing rather than incidental.
  // TWO member-supplied limits now exist and NEITHER is read here. Since #211 a
  // member can supply a limit for a card their issuer does not report one for
  // (`member_cards.credit_limit`), shown on the Credit page with a "You set this"
  // badge; and since migration 0046 they can enter a whole card by hand with its
  // own limit (`manual_accounts.credit_limit`), badged "You added this", for a
  // card Plaid can never reach at all, an authorized-user card on somebody else's
  // login being the case that forced it. Both are deliberately NOT read here.
  // This utilization feeds the Juniper Score's credit factor at weight 0.15, and
  // the Score is a figure Juniper asserts about the member: folding in a
  // self-reported denominator would let anybody raise their own score by typing
  // a generous number, with nothing on screen to show why it moved. #146 removed
  // a flat placeholder from this same factor for the same reason, and a null
  // factor renormalizes the remaining weights, so a member whose only limits are
  // self-reported correctly gets an unmeasured credit factor rather than a
  // flattering one. Do not "helpfully" join member_cards or select
  // manual_accounts.credit_limit in here; the shared `fetchManualAccounts` does
  // not even request that column, which is what keeps this structural rather than
  // a rule somebody has to remember.
  let utilBalance = 0, utilLimit = 0;
  for (const it of items) {
    for (const a of it.accounts || []) {
      const bal = a.balance || 0;
      const type = (a.type || "").toLowerCase();
      if (type === "depository") cashReserves += bal;
      else if (type === "investment" || type === "brokerage") investmentBalance += bal;
      else if (type === "credit") {
        // `creditPosition`, not Math.abs. Plaid reports a credit balance as
        // NEGATIVE when the account is in credit, and abs turned "the issuer owes
        // you $328" into "you owe $328", which made an overpaid card lower the
        // member's score twice over: once through debt load and once through
        // utilization. See api/_credit-balance.ts.
        const { owed } = creditPosition(bal);
        cardDebt += owed;
        const limit = typeof a.limit === "number" ? a.limit : 0;
        if (limit > 0) {
          utilLimit += limit;
          utilBalance += owed;
        }
      }
      else if (type === "loan") loanDebt += Math.abs(bal);
    }
  }

  // Real credit health, from the linked cards, computed before the manual
  // balances fold in below, so a hand-added card's balance cannot land in the
  // numerator of a ratio its limit is kept out of.
  //
  // The reason changed with migration 0046 and the exclusion did not. It used to
  // be that a hand-added card carried a balance and no credit line at all, so
  // counting it would have reported utilization of a limit nobody had entered.
  // A member can now enter that limit, and it is STILL excluded, on the stronger
  // ground above: it is a number they typed, and the Score is Juniper's own
  // assertion. The Credit page counts it and says whose it is.
  const creditUtilization = utilLimit > 0 ? utilBalance / utilLimit : undefined;

  // Stage 10f: the real bureau score, when a member has one. creditFactor()
  // already prefers creditScore over creditUtilization when both are present
  // (src/lib/score.ts / api/_score.ts, unchanged by this stage): a real
  // VantageScore 3.0 is a stronger signal than a utilization ratio guessed
  // from linked-card limits, so it should win rather than being averaged with
  // it. last_score is written by both a live Credit-page pull
  // (api/credit/score.ts) and the Stage 10e monthly cron
  // (api/credit/_score-check.ts), so this reads whichever is freshest without
  // caring which wrote it. Null until the member has gone through Stage 10c's
  // consent and at least one pull has succeeded.
  //
  // The KNOWN GAP this used to carry is closed. It read: "this whole function
  // returns { linked: false } above before this lookup is ever reached when
  // the member has no Plaid item or no transactions yet, so a member with
  // real credit consent but nothing linked still scores as unlinked and gets
  // none of this." That early return is now gated on `hasData` instead, so a
  // credit-consented member reaches this line whether or not they linked a
  // bank. Nothing about /api/finances's own { linked: false } branch changed;
  // it has always made that call from its own account and transaction reads
  // rather than from this function.
  const consentRows = await rows<{ last_score: number | null }>(
    `credit_consents?user_id=eq.${uid}&select=last_score&limit=1`,
  );
  const creditScore = consentRows[0]?.last_score ?? undefined;

  // Fold in manually-added accounts (tier 3) so hand-entered balances, a 401(k),
  // a regional bank Plaid can't reach, count toward the score just like linked
  // ones. They carry no transactions, so income/spending above are unaffected.
  const manual = sumManualAccounts(manualRows);
  cashReserves += manual.cash;
  investmentBalance += manual.invest;
  cardDebt += manual.cardDebt;
  loanDebt += manual.loanDebt;

  // Same precedence as the monthly figures above, and the same reason: a
  // member who typed "$12,000 saved, $6,000 owed" at onboarding and linked
  // nothing had both read as zero here, so their emergency fund scored 0 out
  // of a fund they had told us about. Fallback only, so a real balance is
  // never doubled up with a figure that was meant to describe it.
  let totalDebt = cardDebt + loanDebt;
  if (cashReserves === 0 && savedInputs.cashReserves != null) {
    cashReserves = savedInputs.cashReserves;
    estimated.push("cashReserves");
  }
  if (totalDebt === 0 && savedInputs.totalDebt != null) {
    totalDebt = savedInputs.totalDebt;
    // Attributed to cards rather than split, since the saved figure says
    // nothing about which kind it is, and `signals` is only read by the
    // marketplace picks (which stay gated on `linked`, so they never see it).
    cardDebt = savedInputs.totalDebt;
    estimated.push("totalDebt");
  }

  const totalAssets = cashReserves + investmentBalance;
  const emergencyMonths = monthlySpending > 0 ? cashReserves / monthlySpending : 0;

  return {
    linked,
    hasData: true,
    estimated,
    input: {
      monthlyIncome: Math.round(monthlyIncome),
      monthlySpending: Math.round(monthlySpending),
      cashReserves: Math.round(cashReserves),
      totalDebt: Math.round(totalDebt),
      totalAssets: Math.round(totalAssets),
      investmentBalance: Math.round(investmentBalance),
      // Real utilization when the linked cards report their limits.
      // creditScore is Stage 10f's real VantageScore 3.0, when a credit-
      // consented member has one; creditFactor() prefers it over
      // creditUtilization when both are present. With neither, the engine
      // drops the credit factor rather than inventing a number for it.
      creditUtilization,
      creditScore,
      planProgress,
    },
    signals: {
      monthlySpending: Math.round(monthlySpending),
      cashReserves: Math.round(cashReserves),
      emergencyMonths: Math.round(emergencyMonths * 10) / 10,
      cardDebt: Math.round(cardDebt),
      loanDebt: Math.round(loanDebt),
      investmentBalance: Math.round(investmentBalance),
      annualIncome: Math.round(monthlyIncome * 12),
    },
  };
}

function emptyInput(): ScoreInput {
  return { monthlyIncome: 0, monthlySpending: 0, cashReserves: 0, totalDebt: 0, totalAssets: 0, investmentBalance: 0 };
}

function emptySignals(): PickSignals {
  return { monthlySpending: 0, cashReserves: 0, emergencyMonths: 0, cardDebt: 0, loanDebt: 0, investmentBalance: 0, annualIncome: 0 };
}
