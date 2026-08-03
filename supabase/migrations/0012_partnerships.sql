-- Stage 7: the partner data model — the relationship spine behind the shared
-- workspace. Idempotent — safe to re-run.
--
-- SECURITY: like plaid_items (0007), these are SERVER-ONLY. Two-party visibility
-- (each partner can see the other's shared slice) is subtle to express in RLS, so
-- instead the /api/partner Edge function mediates every read/write with the
-- service-role key and enforces membership + per-member sharing prefs itself. No
-- grants to anon/authenticated; RLS on with a restrictive deny so a leaked user
-- JWT reading via PostgREST gets nothing.

-- ── partnerships ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partnerships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- null until accepted
  status        TEXT NOT NULL DEFAULT 'pending',                    -- pending | active | ended
  invite_token  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  CONSTRAINT partnerships_status_check CHECK (status IN ('pending','active','ended'))
);
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_token_unique
  ON public.partnerships (invite_token) WHERE invite_token IS NOT NULL;
-- At most one ACTIVE partnership per person (as inviter or as partner).
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_active_inviter_unique
  ON public.partnerships (inviter_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_active_partner_unique
  ON public.partnerships (partner_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS partnerships_inviter_idx ON public.partnerships (inviter_id);
CREATE INDEX IF NOT EXISTS partnerships_partner_idx ON public.partnerships (partner_id);

-- ── partner_sharing_prefs ────────────────────────────────────────────────────
-- What each member exposes to the other. Shared goals are always mutual, so they
-- aren't a toggle here.
CREATE TABLE IF NOT EXISTS public.partner_sharing_prefs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id      UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_balances      BOOLEAN NOT NULL DEFAULT TRUE,   -- account totals (not transactions)
  share_transactions  BOOLEAN NOT NULL DEFAULT FALSE,
  share_score         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_sharing_prefs_unique UNIQUE (partnership_id, user_id)
);
CREATE INDEX IF NOT EXISTS partner_sharing_prefs_pid_idx ON public.partner_sharing_prefs (partnership_id);

-- ── shared_goals ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  icon            TEXT NOT NULL DEFAULT 'target',
  target_amount   NUMERIC NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shared_goals_pid_idx ON public.shared_goals (partnership_id);

-- ── shared_goal_contributions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_goal_contributions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES public.shared_goals(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shared_goal_contributions_goal_idx ON public.shared_goal_contributions (goal_id);

-- ── Lock down: server-only, restrictive RLS (same posture as plaid_items) ─────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['partnerships','partner_sharing_prefs','shared_goals','shared_goal_contributions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_no_client_access ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_no_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t, t);
  END LOOP;
END$$;

-- ── updated_at triggers (reuse public.touch_updated_at from 0008) ────────────
DROP TRIGGER IF EXISTS partner_sharing_prefs_touch ON public.partner_sharing_prefs;
CREATE TRIGGER partner_sharing_prefs_touch BEFORE UPDATE ON public.partner_sharing_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS shared_goals_touch ON public.shared_goals;
CREATE TRIGGER shared_goals_touch BEFORE UPDATE ON public.shared_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
