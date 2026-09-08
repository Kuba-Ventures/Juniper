-- Stage 10e: score-change alerts. Two additive changes.
--
-- ---- notifications.kind grows a fourth value ------------------------------
--
-- 'score_change' joins 'reconnect' / 'budget' / 'drift', but it is written
-- differently from all three: those are reconciled from a set of currently-
-- true facts the CLIENT sends on every load (src/lib/notifications.ts), which
-- only works because the client can compute "is this budget over" for itself
-- from data it already has. Whether a bureau score CHANGED is not something
-- the client can derive by itself from one read; it requires comparing two
-- pulls over time, which only the server (here, the cron leg in
-- api/cron/daily-sync.ts, via api/credit/_score-check.ts) has the state to
-- do. So a 'score_change' row is inserted directly, server-side, outside the
-- client-reconcile POST the other three kinds go through. The table does not
-- care who inserts a row as long as dedupe_key and status behave the same
-- way, which is why this needed no other schema change.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('reconnect', 'budget', 'drift', 'score_change'));

-- ---- credit_consents gets a baseline to compare against -------------------
--
-- last_score/last_score_at are the one piece of state score-change detection
-- needs: "what did we last see", so a fresh pull can tell CHANGED from
-- UNCHANGED. Both null until the first pull (by a live Credit-page view, via
-- api/credit/score.ts, or by the monthly cron leg, via
-- api/credit/_score-check.ts -- both write here through the same helper so
-- there is one definition of "the member's last known score", not two).
-- Deliberately not a growing history table: alerting only ever needs the most
-- recent value to diff against, and a member's own trend, if ever built, is a
-- separate, later feature with a real reason to keep more than one row.
ALTER TABLE public.credit_consents ADD COLUMN IF NOT EXISTS last_score INTEGER;
ALTER TABLE public.credit_consents ADD COLUMN IF NOT EXISTS last_score_at TIMESTAMPTZ;

COMMENT ON COLUMN public.credit_consents.last_score IS
  'The most recent VantageScore 3.0 seen for this member, from either a live Credit-page pull or the monthly cron check. Null until the first pull. Used only to detect a CHANGE for Stage 10e alerting, never displayed as history.';
