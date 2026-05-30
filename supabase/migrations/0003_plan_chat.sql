-- Stage 3: plan-scoped chat history.
-- Adds a JSONB column to plans for per-plan chat turns. The Data API GRANT
-- from 0002 already covers this column. Idempotent.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_chat_history JSONB DEFAULT '[]'::jsonb;
