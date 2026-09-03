-- Household data model (issue #258): a shared space for more than two people,
-- parents and kids or any group, distinct from the pairwise `partnerships`
-- (0012). Idempotent, safe to re-run.
--
-- SECURITY: same posture as partnerships (0012) and the shared layer (0013).
-- These are SERVER-ONLY. The /api/household Edge function mediates every read
-- and write with the service-role key and enforces membership, roles and
-- per-account sharing itself. No grants to anon/authenticated; RLS on with a
-- restrictive deny so a leaked user JWT reading via PostgREST gets nothing.
--
-- Decision: a real households table, not partnerships generalized to N. A
-- family needs real role asymmetry (an owner who can invite and remove, a
-- teen who cannot), and that fights the pairwise unique indexes in 0012
-- rather than extending them. Per-account sharing reuses the exact posture
-- account_shares (0013) already has: private by default, opt-in per account,
-- which is what makes "adding a member exposes nothing by itself" true with
-- no special-casing.

-- ── households ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── household_members ────────────────────────────────────────────────────────
-- One row per person who has ever been active. Leaving sets left_at rather
-- than deleting the row, the same convention partnerships.ended_at uses.
CREATE TABLE IF NOT EXISTS public.household_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'adult',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at       TIMESTAMPTZ,
  CONSTRAINT household_members_role_check CHECK (role IN ('owner','adult','teen')),
  CONSTRAINT household_members_unique UNIQUE (household_id, user_id)
);
-- At most one ACTIVE household per person.
CREATE UNIQUE INDEX IF NOT EXISTS household_members_active_user_unique
  ON public.household_members (user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS household_members_household_idx
  ON public.household_members (household_id) WHERE left_at IS NULL;

-- ── household_invites ────────────────────────────────────────────────────────
-- Separate from household_members, unlike partnerships (which overloads one
-- row for both pending and active): a household can have several concurrent
-- open invites at once (invite a parent and a teen in the same sitting).
CREATE TABLE IF NOT EXISTS public.household_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  invite_token  TEXT NOT NULL,
  invited_name  TEXT,
  invited_role  TEXT NOT NULL DEFAULT 'adult',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  accepted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT household_invites_role_check CHECK (invited_role IN ('adult','teen')),
  CONSTRAINT household_invites_status_check CHECK (status IN ('pending','accepted','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS household_invites_token_unique
  ON public.household_invites (invite_token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS household_invites_household_idx
  ON public.household_invites (household_id);

-- ── household_account_shares ─────────────────────────────────────────────────
-- Identical shape to account_shares (0013), keyed by household_id instead of
-- partnership_id. Two states: shared or private. Never transactions, same as
-- every other sharing surface in the app.
CREATE TABLE IF NOT EXISTS public.household_account_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    TEXT NOT NULL,               -- Plaid account_id or manual account id
  scope         TEXT NOT NULL DEFAULT 'private',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT household_account_shares_scope_check CHECK (scope IN ('shared','private')),
  CONSTRAINT household_account_shares_unique UNIQUE (household_id, user_id, account_id)
);
CREATE INDEX IF NOT EXISTS household_account_shares_hid_idx
  ON public.household_account_shares (household_id);

-- ── Lock down: server-only, restrictive RLS (same posture as 0012/0013) ──────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['households','household_members','household_invites','household_account_shares']
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

-- ── updated_at trigger (reuse public.touch_updated_at from 0008) ─────────────
DROP TRIGGER IF EXISTS household_account_shares_touch ON public.household_account_shares;
CREATE TRIGGER household_account_shares_touch BEFORE UPDATE ON public.household_account_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
