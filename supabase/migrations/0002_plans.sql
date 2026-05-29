-- Stage 2: plans table.
-- One active plan per (user_id, domain). Re-running the dialogue overwrites.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain                 TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'in_progress',
  has_partner            BOOLEAN,
  partner_first_name     TEXT,
  goal                   JSONB,
  current_state          JSONB,
  milestones             JSONB DEFAULT '[]'::jsonb,
  kpis                   JSONB DEFAULT '[]'::jsonb,
  next_actions           JSONB DEFAULT '[]'::jsonb,
  dialogue_history       JSONB DEFAULT '[]'::jsonb,
  current_step_index     INT  DEFAULT 0,
  partner_invite_status  TEXT NOT NULL DEFAULT 'none',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plans_status_check CHECK (status IN ('in_progress','completed')),
  CONSTRAINT plans_partner_invite_check
    CHECK (partner_invite_status IN ('none','invited','accepted','declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS plans_user_domain_unique
  ON public.plans (user_id, domain);

CREATE INDEX IF NOT EXISTS plans_user_id_idx ON public.plans (user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_own ON public.plans;
CREATE POLICY plans_select_own ON public.plans
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_insert_own ON public.plans;
CREATE POLICY plans_insert_own ON public.plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_update_own ON public.plans;
CREATE POLICY plans_update_own ON public.plans
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_delete_own ON public.plans;
CREATE POLICY plans_delete_own ON public.plans
  FOR DELETE USING (auth.uid() = user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_touch_updated_at ON public.plans;
CREATE TRIGGER plans_touch_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_plans_updated_at();
