-- When this item's stored BALANCES were last refreshed from Plaid.
--
-- WHY A NEW COLUMN. Two timestamps already exist on plaid_items and neither
-- answers this question:
--   last_synced_at is set by transactions-sync as well as networth-snapshot, so
--     an item whose transactions sync fine and whose balance calls all time out
--     looks freshly synced forever. That is exactly the item this exists for.
--   updated_at is maintained by the touch_plaid_items_updated_at trigger (0007)
--     and therefore moves on every write to the row, including the cursor.
--
-- WHAT READS IT. networth-snapshot carries a refusing item's last known
-- balances into the day's total rather than dropping the whole trend point, and
-- this is the ceiling on that: past CARRY_MAX_DAYS the item stops contributing
-- and the day is skipped honestly, instead of a months-old number being folded
-- into a total presented as today's.
--
-- Idempotent, safe to re-run.
ALTER TABLE public.plaid_items
  ADD COLUMN IF NOT EXISTS balances_refreshed_at TIMESTAMPTZ;

-- Seed existing rows so the ceiling has somewhere to count from. updated_at is
-- an upper bound rather than the truth (the trigger moves it on any write), but
-- it is the closest thing on the row: an item written to recently is likely to
-- have refreshed recently, and a dormant one carries an old value and expires
-- correctly. Only ever applied to rows that have no value yet, so re-running
-- this cannot overwrite a real timestamp recorded by the endpoint.
UPDATE public.plaid_items
   SET balances_refreshed_at = updated_at
 WHERE balances_refreshed_at IS NULL;

COMMENT ON COLUMN public.plaid_items.balances_refreshed_at IS
  'When the stored accounts snapshot was last refreshed from /accounts/balance/get. Distinct from last_synced_at, which any sync sets, and from updated_at, which a trigger moves on every write. Read by api/plaid/networth-snapshot.ts to bound how long a failing item may be carried forward.';
