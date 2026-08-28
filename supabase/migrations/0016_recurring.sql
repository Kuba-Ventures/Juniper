-- Stage 9a: recurring detection, split into what Plaid found and what the
-- member said about it.
-- Idempotent, safe to re-run.
--
-- TWO TABLES, AND THE SPLIT IS THE WHOLE DESIGN.
--
-- `recurring_streams` is a cache of Plaid's /transactions/recurring/get output.
-- It is overwritten on every sync and holds no member intent, so it can be
-- dropped and rebuilt at any time without losing anything.
--
-- `recurring_overrides` is the member's own layer, and it exists because Plaid
-- has no place to put it. Plaid's `is_user_modified` field is DEPRECATED, and
-- their docs state the ability to modify transaction streams has been
-- discontinued, so a correction sent to Plaid has nowhere to land and would not
-- survive the next detection run. Every confirmation, dismissal, rename, and
-- corrected amount therefore lives here, keyed by Plaid's stream_id, and is
-- reapplied over the cache on every read.
--
-- WHY A CONFIRMATION LAYER AT ALL. Plaid tiers its own confidence: a stream is
-- MATURE (three or more occurrences, two for an annual), EARLY_DETECTION, or
-- TOMBSTONED. Rocket Money auto-commits detections and sweeps them to Inactive
-- after one missed month with no documented way to dismiss one, and the
-- reported result is a member surprised by a bill that was never flagged, with
-- no way to say "yes, this is real". Monarch quarantines detections behind a
-- review step instead. This follows Monarch: nothing counts toward a total
-- until the member confirms it.

-- ── recurring_streams: Plaid's detections, cached ───────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_streams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id           TEXT NOT NULL,        -- Plaid's id for the stream
  item_id             TEXT,
  account_id          TEXT,
  description         TEXT,
  merchant_name       TEXT,
  category            TEXT,                 -- resolved Juniper leaf category
  -- Plaid's own confidence tier. Stored raw rather than collapsed to a boolean:
  -- the difference between "we have seen this three times" and "we have seen
  -- this twice and are guessing" is exactly what the member is being asked to
  -- confirm, and flattening it here would throw away the only signal that makes
  -- the review queue meaningful.
  plaid_status        TEXT,                 -- MATURE | EARLY_DETECTION | TOMBSTONED | UNKNOWN
  frequency           TEXT,                 -- WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY | UNKNOWN
  direction           TEXT NOT NULL DEFAULT 'outflow',   -- outflow | inflow
  -- Both amounts, because they answer different questions. `average_amount` is
  -- what to budget; `last_amount` is what actually came out, and a gap between
  -- the two is a price rise the member should see rather than have averaged away.
  average_amount      NUMERIC,
  last_amount         NUMERIC,
  last_date           DATE,
  -- NULLABLE BY DESIGN. Plaid documents this as set "only if the next payment
  -- date can be predicted", so a null means Plaid declined to guess. Juniper
  -- does not fill that in: no date beats an invented one on a screen whose
  -- entire purpose is telling the member what is about to leave their account.
  predicted_next_date DATE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- The backing charges, so a member can open a stream and see the transactions
  -- it was built from. Plaid returns these per stream at no extra call.
  transaction_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_streams_direction_check CHECK (direction IN ('outflow','inflow'))
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_streams_user_stream_unique
  ON public.recurring_streams (user_id, stream_id);
CREATE INDEX IF NOT EXISTS recurring_streams_user_id_idx ON public.recurring_streams (user_id);

GRANT SELECT ON public.recurring_streams TO authenticated;  -- writes are service_role only

ALTER TABLE public.recurring_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_streams_select_own ON public.recurring_streams;
CREATE POLICY recurring_streams_select_own ON public.recurring_streams
  FOR SELECT USING (auth.uid() = user_id);

-- ── recurring_overrides: what the member said ───────────────────────────────
-- One row per stream the member has acted on. No row means "not reviewed yet",
-- which is why the absence of a row is meaningful and rows are DELETED to
-- revert rather than flagged inactive: reverting has to restore the
-- not-yet-reviewed state exactly, and a tombstone would not.
CREATE TABLE IF NOT EXISTS public.recurring_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id        TEXT NOT NULL,
  state            TEXT NOT NULL,      -- confirmed | dismissed
  name             TEXT,               -- the member's own label for it
  expected_amount  NUMERIC,            -- the member's correction to Plaid's average
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_overrides_state_check CHECK (state IN ('confirmed','dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_overrides_user_stream_unique
  ON public.recurring_overrides (user_id, stream_id);
CREATE INDEX IF NOT EXISTS recurring_overrides_user_id_idx ON public.recurring_overrides (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_overrides TO authenticated;

ALTER TABLE public.recurring_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_overrides_select_own ON public.recurring_overrides;
CREATE POLICY recurring_overrides_select_own ON public.recurring_overrides
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS recurring_overrides_insert_own ON public.recurring_overrides;
CREATE POLICY recurring_overrides_insert_own ON public.recurring_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS recurring_overrides_update_own ON public.recurring_overrides;
CREATE POLICY recurring_overrides_update_own ON public.recurring_overrides
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS recurring_overrides_delete_own ON public.recurring_overrides;
CREATE POLICY recurring_overrides_delete_own ON public.recurring_overrides
  FOR DELETE USING (auth.uid() = user_id);

-- ── updated_at triggers ─────────────────────────────────────────────────────
-- public.touch_updated_at() is created in 0008.
DROP TRIGGER IF EXISTS recurring_streams_touch_updated_at ON public.recurring_streams;
CREATE TRIGGER recurring_streams_touch_updated_at
  BEFORE UPDATE ON public.recurring_streams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS recurring_overrides_touch_updated_at ON public.recurring_overrides;
CREATE TRIGGER recurring_overrides_touch_updated_at
  BEFORE UPDATE ON public.recurring_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
