-- Stage 3e follow-up: mark a net-worth point as reconstructed rather than recorded.
-- Idempotent, safe to re-run.
--
-- net_worth_snapshots (0008) holds one row per (user, day), written forward from
-- the day the member linked, because Plaid only reports CURRENT balances. That
-- left a new member's trend as a single dot, while their transaction history
-- reaches back months before they joined.
--
-- api/plaid/networth-backfill.ts fills those earlier days by walking backward
-- from today's balances through the transactions that moved them. Those points
-- are honest arithmetic on real transactions, but they are not observations: the
-- invested portion is today's holdings minus contributions since, so market
-- movement inside the backfilled window is not represented (Plaid has no
-- historical price feed, and /investments/transactions carries flows, not
-- prices).
--
-- The column exists so the chart can say which is which rather than presenting
-- both as the same kind of fact. Defaults FALSE, so every row written before
-- this migration stays what it was: a recorded observation.
ALTER TABLE public.net_worth_snapshots
  ADD COLUMN IF NOT EXISTS estimated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.net_worth_snapshots.estimated IS
  'TRUE when this point was reconstructed backward from transactions rather than observed from live balances. See api/plaid/networth-backfill.ts.';

-- No GRANT change: SELECT on the table is already held by `authenticated` and a
-- new column inherits it. Writes stay service-role only.
