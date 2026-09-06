-- A recurring stream's amount history, so a price rise is visible as a real
-- series rather than only "last vs average this sync" (docs/RECURRING_DETECTION.md
-- section 5 flagged this as deliberately not built yet).
--
-- ---- WHY ONE ROW PER (STREAM, DAY) IT CHANGED, NOT PER SYNC ---------------
--
-- `recurring_streams` (0016) is overwritten on every sync with no trace of the
-- previous amount, by design: it is a cache and can be rebuilt at any time.
-- This table is the trace that cache deliberately does not keep. A row is
-- written only when api/plaid/recurring-sync.ts sees the new `last_amount`
-- clear the same 5%/$1 threshold api/subscriptions.ts already uses for its
-- "paid, not the amount we expected" state, so the table grows on genuine
-- price moves rather than once per sync per stream: a member synced four
-- times a day would otherwise get four identical rows a day forever.
--
-- ---- WHY (user_id, stream_id, observed_on) IS THE UNIQUE KEY --------------
--
-- More than one sync can observe the same new amount on the same day (the
-- member opens the app twice), and the second write should update that day's
-- row rather than insert a duplicate. observed_on is a DATE, not a
-- TIMESTAMPTZ, on purpose: a price history is read as a monthly trend, not a
-- minute-by-minute feed.
CREATE TABLE IF NOT EXISTS public.recurring_amount_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id   TEXT NOT NULL,
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  observed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_amount_history_user_stream_day_unique
  ON public.recurring_amount_history (user_id, stream_id, observed_on);
CREATE INDEX IF NOT EXISTS recurring_amount_history_user_stream_idx
  ON public.recurring_amount_history (user_id, stream_id);

-- Same shape as recurring_streams (0016): a cache the sync writes with the
-- service-role key, select-only for the member it belongs to.
GRANT SELECT ON public.recurring_amount_history TO authenticated;

ALTER TABLE public.recurring_amount_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_amount_history_select_own ON public.recurring_amount_history;
CREATE POLICY recurring_amount_history_select_own ON public.recurring_amount_history
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.recurring_amount_history IS
  'One row per (stream, day) a recurring stream''s amount cleared the 5%/$1 meaningful-drift threshold (api/_recurring-drift.ts), written by api/plaid/recurring-sync.ts before it overwrites recurring_streams.last_amount for that stream. Read by api/subscriptions.ts to show a real price-rise series rather than only the current vs previous sync.';
