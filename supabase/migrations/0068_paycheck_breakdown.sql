-- Six columns on user_profiles for the paycheck-breakdown nudge (issue #402).
--
-- ---- WHY --------------------------------------------------------------
--
-- The money-snapshot nudge asked for two rough numbers, monthly take-home
-- pay and monthly essential expenses, and that second number was always a
-- single blend: rent, groceries, a car payment, everything at once. Issue
-- #402 asked for something Plaid cannot answer at all: what came out of
-- the paycheck BEFORE it landed (401(k), health insurance, HSA/FSA), which
-- Juniper only ever sees the net deposit for, no bank or investment feed
-- carries a paycheck's own line items. So there is no route to this
-- through more Plaid data, only through the member typing it, the same
-- honest-self-report shape `monthly_income`/`monthly_expenses` already are.
--
-- ---- WHAT THIS DOES AND DOES NOT REPLACE -------------------------------
--
-- `monthly_income`/`monthly_expenses` (0001) are unchanged in meaning and
-- keep feeding the Score exactly as before: take-home pay, and the sum of
-- what comes out after it lands. The client computes that sum itself from
-- `expense_rent` + `expense_loan_payments` + `expense_other_essentials`
-- and writes it into the existing `monthly_expenses` column, so nothing
-- downstream (api/_finance-snapshot.ts, api/_score.ts, src/lib/score.ts,
-- src/lib/manual-finances.ts) needs to change or even know this migration
-- exists. These six new columns are the itemized DETAIL behind that sum,
-- kept so reopening the nudge shows the breakdown rather than one blended
-- figure, and so the card can show an estimated gross pay figure.
--
-- ---- THE THREE BEFORE-YOU'RE-PAID COLUMNS, DELIBERATELY UNREAD ---------
--
-- `deduction_401k`, `deduction_health_insurance`, `deduction_hsa_fsa` never
-- reach api/_finance-snapshot.ts or the Score. They are informational only,
-- used to compute an "estimated gross pay" line on the card itself. Wiring
-- a real retirement-contribution-rate factor into the Score is a genuine
-- future feature, not a side effect of a data-entry nudge, the same
-- boundary 0033/0046 draw around a member-typed credit limit.
--
-- All six are plain NUMERIC, nullable, no paired `_set_at` column: this
-- table already carries `updated_at`.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS deduction_401k NUMERIC,
  ADD COLUMN IF NOT EXISTS deduction_health_insurance NUMERIC,
  ADD COLUMN IF NOT EXISTS deduction_hsa_fsa NUMERIC,
  ADD COLUMN IF NOT EXISTS expense_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS expense_loan_payments NUMERIC,
  ADD COLUMN IF NOT EXISTS expense_other_essentials NUMERIC;

-- A negative deduction or expense is not a value anybody would type on
-- purpose, and zero has no honest use here either: a checked category with
-- nothing in it is just an unchecked category. Guard rather than trust,
-- since every one of these arrives from a text field.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_paycheck_fields_positive'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_paycheck_fields_positive
      CHECK (
        (deduction_401k IS NULL OR deduction_401k > 0) AND
        (deduction_health_insurance IS NULL OR deduction_health_insurance > 0) AND
        (deduction_hsa_fsa IS NULL OR deduction_hsa_fsa > 0) AND
        (expense_rent IS NULL OR expense_rent > 0) AND
        (expense_loan_payments IS NULL OR expense_loan_payments > 0) AND
        (expense_other_essentials IS NULL OR expense_other_essentials > 0)
      );
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and 0001's
-- owner-scoped RLS already covers every column on this table.

COMMENT ON COLUMN public.user_profiles.deduction_401k IS
  '401(k)/retirement contribution the member typed as coming out before take-home pay. Informational only: never read by api/_finance-snapshot.ts or the Score, used only to show an estimated gross pay figure on the paycheck-breakdown card.';
COMMENT ON COLUMN public.user_profiles.deduction_health_insurance IS
  'Health/dental insurance premium the member typed as coming out before take-home pay. Same informational-only rule as deduction_401k.';
COMMENT ON COLUMN public.user_profiles.deduction_hsa_fsa IS
  'HSA/FSA contribution the member typed as coming out before take-home pay. Same informational-only rule as deduction_401k.';
COMMENT ON COLUMN public.user_profiles.expense_rent IS
  'Rent/mortgage the member typed as coming out of take-home pay. Counted into monthly_expenses by the client on save; this column is the itemized detail behind that sum.';
COMMENT ON COLUMN public.user_profiles.expense_loan_payments IS
  'Loan payments (auto, student, personal) the member typed as coming out of take-home pay. Same role as expense_rent: itemized detail behind monthly_expenses.';
COMMENT ON COLUMN public.user_profiles.expense_other_essentials IS
  'Other essential spending the member typed as coming out of take-home pay. Same role as expense_rent: itemized detail behind monthly_expenses.';

-- Expect: every existing row unchanged, all six new columns NULL, because
-- nothing written before today had any of them to record.
SELECT count(*)                                              AS profiles,
       count(*) FILTER (WHERE deduction_401k IS NOT NULL)     AS with_401k,
       count(*) FILTER (WHERE expense_rent IS NOT NULL)       AS with_rent
  FROM public.user_profiles;
