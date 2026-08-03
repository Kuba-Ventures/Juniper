-- Stage 4: Juniper Score history — one snapshot per (user, day) so we can draw
-- the score trend line and compute month-over-month deltas.
-- Idempotent — safe to re-run.
--
-- Like transactions/budgets (0008), this is the user's own data: client-readable
-- (GRANT SELECT to `authenticated` + owner RLS), written server-side with the
-- service-role key (which bypasses RLS, so the writer scopes by user_id itself).

CREATE TABLE IF NOT EXISTS public.score_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of       DATE NOT NULL,
  value       INTEGER NOT NULL,              -- 0–100 Juniper Score
  band        TEXT,
  factors     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- per-factor breakdown at compute time
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS score_history_user_asof_unique
  ON public.score_history (user_id, as_of);
CREATE INDEX IF NOT EXISTS score_history_user_id_idx ON public.score_history (user_id);

GRANT SELECT ON public.score_history TO authenticated;

ALTER TABLE public.score_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS score_history_select_own ON public.score_history;
CREATE POLICY score_history_select_own ON public.score_history
  FOR SELECT USING (auth.uid() = user_id);
