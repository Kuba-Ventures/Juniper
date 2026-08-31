-- Stage 9a follow-up: the member's own cadence for a recurring stream.
-- Idempotent, safe to re-run.
--
-- WHY THIS COLUMN EXISTS. `recurring_overrides` already holds the member's name
-- and their corrected expected amount (0016), and `/api/subscriptions` computes
-- a per-month figure from `recurring_streams.frequency`, which is Plaid's answer
-- and is not correctable. Plaid returns UNKNOWN whenever it cannot name a
-- cadence, and PER_YEAR deliberately has no entry for UNKNOWN, so those streams
-- are listed, counted in `unknownCadence`, and left out of the monthly total
-- entirely. That is the honest behaviour while nobody can tell us the answer,
-- and it is exactly the question a member can answer and Plaid cannot: they know
-- the gym bills monthly even when three charges were not enough for Plaid to say
-- so.
--
-- NULL MEANS "USE WHAT PLAID SAID", the same convention every other column in
-- this table follows. So a member who never touches the cadence costs no value
-- here, and clearing their answer restores Plaid's rather than freezing the
-- value Plaid happened to hold on the day they cleared it.
--
-- UNKNOWN IS DELIBERATELY NOT ACCEPTABLE. The five values below are exactly the
-- keys PER_YEAR can convert to a monthly figure. Letting a member store UNKNOWN
-- would let them remove a charge from their own total with no way to see, from
-- the row, that they had done it, and "this is not really recurring" already has
-- a control: dismiss.
--
-- NO NEW GRANT. Grants here are table-level and were issued in 0016, so a new
-- column on an already-granted table is reachable without one. This is not the
-- new-table footgun recorded in PROJECT.md.

ALTER TABLE public.recurring_overrides
  ADD COLUMN IF NOT EXISTS frequency TEXT;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and this file has to be
-- re-runnable, so the constraint is added only when it is absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recurring_overrides'::regclass
      AND conname = 'recurring_overrides_frequency_check'
  ) THEN
    ALTER TABLE public.recurring_overrides
      ADD CONSTRAINT recurring_overrides_frequency_check
      CHECK (frequency IS NULL OR frequency IN
        ('WEEKLY','BIWEEKLY','SEMI_MONTHLY','MONTHLY','ANNUALLY'));
  END IF;
END $$;

COMMENT ON COLUMN public.recurring_overrides.frequency IS
  'The member''s own cadence for this stream, overriding recurring_streams.frequency. NULL means use Plaid''s. UNKNOWN is not accepted: the five permitted values are exactly those PER_YEAR in api/subscriptions.ts can turn into a monthly figure, and hiding a charge from the total is what dismiss is for.';
