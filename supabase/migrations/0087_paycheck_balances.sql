-- Two more columns on user_profiles: a current balance for the two
-- before-you're-paid categories that actually carry one, 401(k) and HSA/FSA
-- (health insurance is a premium, not a balance, so it gets no counterpart).
--
-- ---- WHY --------------------------------------------------------------
--
-- The onboarding paycheck step (migration 0068) captures the per-paycheck
-- contribution amount for 401(k) and HSA/FSA, but a member who already has
-- one of these has no way to say what is already in it. Same shape of gap
-- 0068 itself closed for the contribution amount: Juniper cannot see this
-- number from any linked source (401(k) and HSA custodians are not Plaid
-- institutions in this app today), so the only route is the member typing
-- it, same as every other paycheck-breakdown figure.
--
-- ---- INFORMATIONAL ONLY, SAME RULE AS 0068 -----------------------------
--
-- Like deduction_401k/deduction_hsa_fsa before them, these two columns are
-- never read by api/_finance-snapshot.ts or the Score. Feeding a real
-- retirement/HSA balance into net worth or the Score is a genuine future
-- feature (it would need its own accounting, since a 401(k) is not a
-- linked or manual account today), not a side effect of adding an optional
-- field to a data-entry nudge.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS balance_401k NUMERIC,
  ADD COLUMN IF NOT EXISTS balance_hsa_fsa NUMERIC;

-- Same guard as 0068's CHECK: a balance of exactly zero has no honest use
-- here (an account with nothing in it is just an unchecked category), and a
-- negative balance is not a value anybody would type on purpose.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_paycheck_balances_positive'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_paycheck_balances_positive
      CHECK (
        (balance_401k IS NULL OR balance_401k > 0) AND
        (balance_hsa_fsa IS NULL OR balance_hsa_fsa > 0)
      );
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and 0001's
-- owner-scoped RLS already covers every column on this table.

COMMENT ON COLUMN public.user_profiles.balance_401k IS
  'Current 401(k)/retirement balance the member typed, if known. Informational only: never read by api/_finance-snapshot.ts or the Score, same rule as deduction_401k (migration 0068).';
COMMENT ON COLUMN public.user_profiles.balance_hsa_fsa IS
  'Current HSA/FSA balance the member typed, if known. Same informational-only rule as balance_401k.';

-- Expect: every existing row unchanged, both new columns NULL, because
-- nothing written before today had either to record.
SELECT count(*)                                           AS profiles,
       count(*) FILTER (WHERE balance_401k IS NOT NULL)    AS with_401k_balance,
       count(*) FILTER (WHERE balance_hsa_fsa IS NOT NULL) AS with_hsa_balance
  FROM public.user_profiles;
