-- Stage 1 of docs/CUSTOM_CATEGORIES.md: stable category ids, alongside the
-- labels, changing nothing a member can see.
-- Idempotent, safe to re-run.
--
-- WHY. Three tables identify a category by its TEXT label, and `budgets` has a
-- unique index on (user_id, category, period), so renaming a category would
-- orphan the member's own budget with no error. Per-member categories cannot
-- ship until a category has an identity independent of its name.
--
-- This migration only ADDS. Nothing reads `category_id` yet: every read path
-- still resolves the text column through api/_categorize.ts, so the two can be
-- compared on real data before anything depends on the id. That ordering is
-- deliberate, because api/_finance-snapshot.ts feeds the Juniper Score and a
-- classification that changes is a member's visible score history changing.
--
-- The mapping below is GENERATED from CATEGORY_GROUPS in api/_categorize.ts and
-- must stay in step with `categoryIdOf()` there. Where a label names both a
-- group and a leaf inside it (Shopping, Transportation, Utilities & bills,
-- Groceries & dining, Everything else), the LEAF id wins, exactly as the
-- LABEL_ID build order in that module does: a row carrying one of those values
-- is the group's catch-all leaf, and groupOf() resolves it to the group anyway.

ALTER TABLE public.transactions      ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE public.budgets           ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE public.recurring_streams ADD COLUMN IF NOT EXISTS category_id TEXT;

COMMENT ON COLUMN public.transactions.category_id IS
  'Stable id for `category`. Written since stage 1 of custom categories, not yet read. Null means the label was not in the taxonomy.';
COMMENT ON COLUMN public.budgets.category_id IS
  'Stable id for `category`. Written since stage 1 of custom categories, not yet read.';
COMMENT ON COLUMN public.recurring_streams.category_id IS
  'Stable id for `category`. Written since stage 1 of custom categories, not yet read.';

-- The lookups the later stages will need. Partial, because until the backfill
-- of a member's older rows completes there is no value in indexing the nulls.
CREATE INDEX IF NOT EXISTS transactions_user_catid_idx
  ON public.transactions (user_id, category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS budgets_user_catid_idx
  ON public.budgets (user_id, category_id) WHERE category_id IS NOT NULL;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- One pass per table, only where the id is still null, so a re-run is a no-op
-- and a row whose label we do not recognize is left null rather than being
-- assigned a plausible id it never earned.
WITH m(label, id) AS (VALUES
    ('Housing', 'g_housing'),
    ('Groceries & dining', 'c_groceries_dining'),
    ('Transportation', 'c_transportation'),
    ('Debt payments', 'g_debt_payments'),
    ('Shopping', 'c_shopping'),
    ('Fun & travel', 'g_fun_travel'),
    ('Utilities & bills', 'c_utilities_bills'),
    ('Kids & health', 'g_kids_health'),
    ('Everything else', 'c_everything_else'),
    ('Income', 'g_income'),
    ('Transfers & payments', 'g_transfers_payments'),
    ('Rent', 'c_rent'),
    ('Mortgage', 'c_mortgage'),
    ('Home & repairs', 'c_home_repairs'),
    ('Groceries', 'c_groceries'),
    ('Restaurants & bars', 'c_restaurants_bars'),
    ('Coffee shops', 'c_coffee_shops'),
    ('Gas', 'c_gas'),
    ('Car payment', 'c_car_payment'),
    ('Auto & parking', 'c_auto_parking'),
    ('Rides & transit', 'c_rides_transit'),
    ('Student loans', 'c_student_loans'),
    ('Loan payment', 'c_loan_payment'),
    ('Clothing', 'c_clothing'),
    ('Electronics', 'c_electronics'),
    ('Gifts & donations', 'c_gifts_donations'),
    ('Entertainment', 'c_entertainment'),
    ('Streaming & music', 'c_streaming_music'),
    ('Travel', 'c_travel'),
    ('Utilities', 'c_utilities'),
    ('Phone & internet', 'c_phone_internet'),
    ('Insurance', 'c_insurance'),
    ('Medical', 'c_medical'),
    ('Dental & vision', 'c_dental_vision'),
    ('Pharmacy', 'c_pharmacy'),
    ('Fitness', 'c_fitness'),
    ('Personal care', 'c_personal_care'),
    ('Childcare', 'c_childcare'),
    ('Bank fees', 'c_bank_fees'),
    ('Taxes & government', 'c_taxes_government'),
    ('Education', 'c_education'),
    ('Services', 'c_services'),
    ('Paycheck', 'c_paycheck'),
    ('Interest & dividends', 'c_interest_dividends'),
    ('Retirement income', 'c_retirement_income'),
    ('Tax refund', 'c_tax_refund'),
    ('Other income', 'c_other_income'),
    ('Credit card payment', 'c_credit_card_payment'),
    ('Transfer to savings', 'c_transfer_to_savings'),
    ('Transfer to investments', 'c_transfer_to_investments'),
    ('Transfer out', 'c_transfer_out'),
    ('Transfer in', 'c_transfer_in')
)
UPDATE public.transactions t SET category_id = m.id
  FROM m WHERE t.category = m.label AND t.category_id IS NULL;

WITH m(label, id) AS (VALUES
    ('Housing', 'g_housing'),
    ('Groceries & dining', 'c_groceries_dining'),
    ('Transportation', 'c_transportation'),
    ('Debt payments', 'g_debt_payments'),
    ('Shopping', 'c_shopping'),
    ('Fun & travel', 'g_fun_travel'),
    ('Utilities & bills', 'c_utilities_bills'),
    ('Kids & health', 'g_kids_health'),
    ('Everything else', 'c_everything_else'),
    ('Income', 'g_income'),
    ('Transfers & payments', 'g_transfers_payments'),
    ('Rent', 'c_rent'),
    ('Mortgage', 'c_mortgage'),
    ('Home & repairs', 'c_home_repairs'),
    ('Groceries', 'c_groceries'),
    ('Restaurants & bars', 'c_restaurants_bars'),
    ('Coffee shops', 'c_coffee_shops'),
    ('Gas', 'c_gas'),
    ('Car payment', 'c_car_payment'),
    ('Auto & parking', 'c_auto_parking'),
    ('Rides & transit', 'c_rides_transit'),
    ('Student loans', 'c_student_loans'),
    ('Loan payment', 'c_loan_payment'),
    ('Clothing', 'c_clothing'),
    ('Electronics', 'c_electronics'),
    ('Gifts & donations', 'c_gifts_donations'),
    ('Entertainment', 'c_entertainment'),
    ('Streaming & music', 'c_streaming_music'),
    ('Travel', 'c_travel'),
    ('Utilities', 'c_utilities'),
    ('Phone & internet', 'c_phone_internet'),
    ('Insurance', 'c_insurance'),
    ('Medical', 'c_medical'),
    ('Dental & vision', 'c_dental_vision'),
    ('Pharmacy', 'c_pharmacy'),
    ('Fitness', 'c_fitness'),
    ('Personal care', 'c_personal_care'),
    ('Childcare', 'c_childcare'),
    ('Bank fees', 'c_bank_fees'),
    ('Taxes & government', 'c_taxes_government'),
    ('Education', 'c_education'),
    ('Services', 'c_services'),
    ('Paycheck', 'c_paycheck'),
    ('Interest & dividends', 'c_interest_dividends'),
    ('Retirement income', 'c_retirement_income'),
    ('Tax refund', 'c_tax_refund'),
    ('Other income', 'c_other_income'),
    ('Credit card payment', 'c_credit_card_payment'),
    ('Transfer to savings', 'c_transfer_to_savings'),
    ('Transfer to investments', 'c_transfer_to_investments'),
    ('Transfer out', 'c_transfer_out'),
    ('Transfer in', 'c_transfer_in')
)
UPDATE public.budgets b SET category_id = m.id
  FROM m WHERE b.category = m.label AND b.category_id IS NULL;

WITH m(label, id) AS (VALUES
    ('Housing', 'g_housing'),
    ('Groceries & dining', 'c_groceries_dining'),
    ('Transportation', 'c_transportation'),
    ('Debt payments', 'g_debt_payments'),
    ('Shopping', 'c_shopping'),
    ('Fun & travel', 'g_fun_travel'),
    ('Utilities & bills', 'c_utilities_bills'),
    ('Kids & health', 'g_kids_health'),
    ('Everything else', 'c_everything_else'),
    ('Income', 'g_income'),
    ('Transfers & payments', 'g_transfers_payments'),
    ('Rent', 'c_rent'),
    ('Mortgage', 'c_mortgage'),
    ('Home & repairs', 'c_home_repairs'),
    ('Groceries', 'c_groceries'),
    ('Restaurants & bars', 'c_restaurants_bars'),
    ('Coffee shops', 'c_coffee_shops'),
    ('Gas', 'c_gas'),
    ('Car payment', 'c_car_payment'),
    ('Auto & parking', 'c_auto_parking'),
    ('Rides & transit', 'c_rides_transit'),
    ('Student loans', 'c_student_loans'),
    ('Loan payment', 'c_loan_payment'),
    ('Clothing', 'c_clothing'),
    ('Electronics', 'c_electronics'),
    ('Gifts & donations', 'c_gifts_donations'),
    ('Entertainment', 'c_entertainment'),
    ('Streaming & music', 'c_streaming_music'),
    ('Travel', 'c_travel'),
    ('Utilities', 'c_utilities'),
    ('Phone & internet', 'c_phone_internet'),
    ('Insurance', 'c_insurance'),
    ('Medical', 'c_medical'),
    ('Dental & vision', 'c_dental_vision'),
    ('Pharmacy', 'c_pharmacy'),
    ('Fitness', 'c_fitness'),
    ('Personal care', 'c_personal_care'),
    ('Childcare', 'c_childcare'),
    ('Bank fees', 'c_bank_fees'),
    ('Taxes & government', 'c_taxes_government'),
    ('Education', 'c_education'),
    ('Services', 'c_services'),
    ('Paycheck', 'c_paycheck'),
    ('Interest & dividends', 'c_interest_dividends'),
    ('Retirement income', 'c_retirement_income'),
    ('Tax refund', 'c_tax_refund'),
    ('Other income', 'c_other_income'),
    ('Credit card payment', 'c_credit_card_payment'),
    ('Transfer to savings', 'c_transfer_to_savings'),
    ('Transfer to investments', 'c_transfer_to_investments'),
    ('Transfer out', 'c_transfer_out'),
    ('Transfer in', 'c_transfer_in')
)
UPDATE public.recurring_streams r SET category_id = m.id
  FROM m WHERE r.category = m.label AND r.category_id IS NULL;
