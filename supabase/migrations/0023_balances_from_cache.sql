-- Whether this item's stored balances came from Plaid's cache rather than a
-- live pull from the bank.
--
-- WHY IT NEEDS RECORDING. networth-snapshot falls back to /accounts/get when
-- /accounts/balance/get times out, which is what keeps a chronically slow bank
-- (Carter Bank & Trust) contributing a real figure instead of nothing. Both
-- paths write balances_refreshed_at, deliberately, so nothing on the row said
-- which one had happened and a cached balance was indistinguishable from a live
-- one on screen.
--
-- WHAT READS IT. The Connections page, so an institution permanently on the
-- cached path says so rather than looking identical to the six that are not.
--
-- Defaults FALSE: every row predates the fallback, and the next successful
-- refresh sets the truth either way.
--
-- Idempotent, safe to re-run.
ALTER TABLE public.plaid_items
  ADD COLUMN IF NOT EXISTS balances_from_cache BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.plaid_items.balances_from_cache IS
  'TRUE when the stored accounts snapshot came from /accounts/get (Plaid''s cached balances) because /accounts/balance/get timed out. Written by api/plaid/networth-snapshot.ts on every refresh, so it always describes the most recent one.';
