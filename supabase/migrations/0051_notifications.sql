-- The notifications bell's history: which live facts a member has been shown,
-- and what they did about each one. Idempotent, safe to re-run.
--
-- ---- WHY THE CLIENT DECIDES WHAT IS TRUE, NOT THIS TABLE ------------------
--
-- A connection needing reconnecting, a budget over its limit, and a charge
-- that drifted from what a member confirmed are already computed, correctly,
-- by /api/finances and /api/subscriptions (src/lib/notifications.ts reads
-- both, on the app bar's own load). Re-deriving them a second time here, from
-- raw Plaid and budget rows, would be a second definition of "is this budget
-- over" free to disagree with the first the moment either changes, which is
-- exactly the class of bug this codebase keeps a pure, single-source module
-- for elsewhere (_rewards.ts, _category-precedence.ts). So the client sends
-- the CURRENT set of true facts on every load, keyed by a stable dedupe_key
-- per fact instance, and api/notifications.ts's only job is reconciliation:
-- remember which ones a member has seen and cleared, and notice when one
-- stops arriving (resolved) or a new one starts (a fresh dedupe_key).
--
-- ---- WHY dedupe_key CARRIES THE INSTANCE, NOT JUST THE KIND ---------------
--
-- "Groceries over budget" in September and October are different
-- occurrences: the client's key for a budget fact carries the period
-- ("budget:Groceries:2026-09"), so clearing September's does not suppress
-- October's, because October's key was never written and reconciliation
-- inserts it fresh. A dead connection's key carries the failure's own start
-- time (plaid_items.last_error_at), so a connection that recovers and later
-- fails again gets a new key too, rather than silently reusing a cleared row.
--
-- ---- WHY CLEARING SETS status='cleared' RATHER THAN DELETING THE ROW ------
--
-- Deleting the row on clear would erase the only record that the fact was
-- ever shown, so the next reconciliation, seeing the same dedupe_key sent
-- again because the underlying problem is still true, would insert it as
-- brand new: a cleared notification for an unresolved problem would come
-- straight back on the next page load. 'cleared' is durable for that exact
-- instance instead, the same shape as recurring_overrides.state='dismissed'
-- (0016): a member's "stop showing me this" outlives the fact remaining
-- true, and only a genuinely new instance (a new dedupe_key) notifies again.
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('reconnect', 'budget', 'drift')),
  -- Stable per fact INSTANCE, not per kind: see header. Unique with user_id.
  dedupe_key  TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL,
  href        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cleared')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  read_at     TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_dedupe_key_not_blank CHECK (length(btrim(dedupe_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_unique
  ON public.notifications (user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_status_idx
  ON public.notifications (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS
  'The notifications bell''s history. The set of currently-true facts is computed client-side from /api/finances and /api/subscriptions (src/lib/notifications.ts) and reconciled here by dedupe_key on every load: a key not sent this time is marked resolved, a new key is inserted active. Clearing sets status=''cleared'' rather than deleting the row, so a cleared notification for a still-true fact does not reappear on the next load; only a new dedupe_key (a genuinely new instance) notifies again.';
