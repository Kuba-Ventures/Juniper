-- Documentation only: no schema change, no data change, and nothing depends on
-- it. Safe to apply whenever, or never.
--
-- 0015 introduced net_worth_snapshots.estimated for one case, a point rebuilt
-- backward from transactions. It now covers a second: a day where one bank did
-- not answer and its last known balance was carried forward rather than the
-- whole day's point being dropped. Both mean the same thing to a reader, which
-- is that the point was worked out rather than read live, so they share a flag.
COMMENT ON COLUMN public.net_worth_snapshots.estimated IS
  'TRUE when this point was worked out rather than observed live: either reconstructed backward from transactions (api/plaid/networth-backfill.ts), or written with one item''s last known balance carried forward because it did not answer (api/plaid/networth-snapshot.ts).';
