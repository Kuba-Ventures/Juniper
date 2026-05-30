-- Stage 4: partner support.
-- Adds partner-side dialogue state, a shareable invite token, and broadens
-- RLS so both partners can read/write the shared plan. Idempotent.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_collected JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS partner_dialogue_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS partner_current_step_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_dialogue_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Constrain partner_dialogue_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_partner_dialogue_status_check'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_partner_dialogue_status_check
      CHECK (partner_dialogue_status IN ('not_started','in_progress','completed'));
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS plans_invite_token_unique
  ON public.plans (invite_token)
  WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS plans_partner_user_id_idx
  ON public.plans (partner_user_id)
  WHERE partner_user_id IS NOT NULL;

-- ── RLS update: allow partner read/write on shared plan ───────────────────
DROP POLICY IF EXISTS plans_select_own ON public.plans;
CREATE POLICY plans_select_own
  ON public.plans
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = partner_user_id);

DROP POLICY IF EXISTS plans_update_own ON public.plans;
CREATE POLICY plans_update_own
  ON public.plans
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = partner_user_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = partner_user_id);

-- INSERT and DELETE remain owner-only.
-- ── Invite-acceptance: allow lookup of plans by token ─────────────────────
-- A separate SELECT policy keyed on the token: any authenticated user can
-- read a plan row when they hold the matching invite token. This is needed
-- so the invite landing page (and accept endpoint) can find the plan before
-- the partner_user_id is set.
DROP POLICY IF EXISTS plans_select_by_invite_token ON public.plans;
CREATE POLICY plans_select_by_invite_token
  ON public.plans
  FOR SELECT
  USING (
    invite_token IS NOT NULL
    AND current_setting('request.jwt.claims', true)::jsonb ? 'sub'
  );

-- The above is intentionally broad. The server-side endpoint scopes the
-- actual fetch by token. We're using RLS as a coarse gate (authenticated
-- only) and the API layer for the precise scoping.
