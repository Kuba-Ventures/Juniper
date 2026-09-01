-- A credit limit, and a mask, on a manually-added account.
--
-- ---- WHY ------------------------------------------------------------------
--
-- Some credit cards can never arrive through Plaid, however many times somebody
-- relinks. The case that forced this one: a card issued to the member as an
-- AUTHORIZED USER on another person's login. Plaid returns only the accounts
-- belonging to the login it authenticates, so no credential the member holds
-- will ever surface it. Credit Karma, Monarch and the issuer's own site show it
-- because they read credit-bureau data rather than linked accounts, and Juniper
-- has no bureau feed (ROADMAP.md Stage 10, still without a provider).
--
-- The consequence was a wrong number rather than a missing one. Utilization
-- divides a balance by the sum of the limits Juniper can see, so a limit it
-- cannot see makes the denominator too small and the percentage too high:
-- $562 / $17,900 = 3 percent in Juniper against $562 / $37,900 = 1.5 percent on
-- the member's own credit report. Immaterial at that balance. Material for
-- anybody who carries one, and the Juniper Score inherits the same skew.
--
-- `manual_accounts` (0014) already exists for exactly this, "anything Plaid
-- cannot reach, entered by hand", and its `category = 'credit'` rows already
-- count as card debt in net worth (api/_manual-accounts.ts). What it could not
-- do was hold the one field utilization needs. So a member could tell Juniper
-- about the card and still not fix the number, which is the worst of both.
--
-- ---- THE TWO COLUMNS ------------------------------------------------------
--
-- `credit_limit`. NULL means unknown, NOT zero, the same convention
-- `utilizationPct` in api/_credit-balance.ts already relies on: it returns null
-- rather than 0 for an unknown limit, because "we do not know" and "you are
-- using none of it" are different facts and the Credit page prints them
-- differently. No paired `_set_at` column, unlike 0033 on `member_cards`: this
-- table already carries `updated_at`, so the number can be aged without one.
--
-- `mask`. So a hand-entered card is identifiable in a list beside Plaid-linked
-- cards showing "....1575". Not restricted to credit accounts, because the last
-- four digits identify a checking account just as usefully.
--
-- ---- IT MUST NEVER REACH THE JUNIPER SCORE --------------------------------
--
-- Same rule as 0033's `member_cards.credit_limit`, and for the same reason. A
-- limit typed by the member is a CLAIM. The Juniper Score is a figure Juniper
-- asserts, so it is built only from what Juniper can measure, and a member who
-- could raise their own score by typing a generous number would be scoring
-- themselves. api/_finance-snapshot.ts reaches manual accounts only through
-- `sumManualAccounts`, whose ManualTotals has no limit field at all, and this
-- column is deliberately absent from the shared `fetchManualAccounts` select for
-- the same reason: the score path cannot read what it is never handed.
-- Utilization on the Credit page is a different claim, made to the member about
-- their own number, and labelled "You added this" wherever it appears.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.manual_accounts
  -- NULL means unknown. Positive only, see the CHECK below.
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC,
  -- Last four digits, as the member reads them off the card. TEXT, not an
  -- integer, because a leading zero is part of a mask and would be lost.
  ADD COLUMN IF NOT EXISTS mask TEXT;

-- A limit on a checking account is meaningless, so it is made unrepresentable
-- rather than merely discouraged. The write endpoint rejects it too, with a
-- message; this is the floor under that.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_accounts_credit_limit_category'
  ) THEN
    ALTER TABLE public.manual_accounts
      ADD CONSTRAINT manual_accounts_credit_limit_category
      CHECK (credit_limit IS NULL OR category = 'credit');
  END IF;
END $$;

-- Guard rather than trust: this value arrives from a text field. Zero would make
-- the utilization division an infinity, and a negative limit is not a limit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_accounts_credit_limit_positive'
  ) THEN
    ALTER TABLE public.manual_accounts
      ADD CONSTRAINT manual_accounts_credit_limit_positive
      CHECK (credit_limit IS NULL OR credit_limit > 0);
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and the owner-scoped
-- RLS from 0014 already covers every column added here.

COMMENT ON COLUMN public.manual_accounts.credit_limit IS
  'A credit limit the member typed for a card Plaid cannot reach at all, the case being an authorized-user card on another persons login. NULL means unknown, never zero. Only valid on category = credit, enforced by CHECK. Counted in the Credit pages utilization with a "You added this" badge, and DELIBERATELY NOT read by api/_finance-snapshot.ts or api/_score.ts, so it cannot move the Juniper Score: otherwise a member could raise their own score by entering a generous number.';
COMMENT ON COLUMN public.manual_accounts.mask IS
  'Last four digits of the account, so a hand-entered account is identifiable beside Plaid-linked ones. TEXT because a leading zero is part of a mask. Optional on every category.';

-- Expect: every existing row unchanged, with both new columns NULL, because
-- nothing written before today had either to record.
SELECT count(*)                                             AS manual_accounts,
       count(*) FILTER (WHERE category = 'credit')           AS credit_accounts,
       count(*) FILTER (WHERE credit_limit IS NOT NULL)      AS with_limit,
       count(*) FILTER (WHERE mask IS NOT NULL)              AS with_mask
  FROM public.manual_accounts;
