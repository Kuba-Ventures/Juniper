-- A plan can be shared to a household (issue #321, the household page's
-- Plans tab). Households never touch `plans` directly: the RLS on that table
-- is owner-plus-one-partner (0004, `auth.uid() = user_id OR auth.uid() =
-- partner_user_id`), and a household can hold more than two people, so
-- widening that policy with a subquery into household_members would need
-- either a grant on a server-only table or a SECURITY DEFINER escape hatch --
-- both bigger and riskier than the alternative: this table records ONLY which
-- (owner, domain) pairs are shared, exactly like household_account_shares
-- (0055) does for accounts, and /api/household is the sole reader, joining it
-- to `plans` itself with the service-role key. `plans` and its RLS are
-- untouched.
--
-- Presence is the whole state: a row here means shared, and there is no
-- "private" row to write, unlike household_account_shares, which stores an
-- explicit scope. An account defaults private with nothing recorded, so a
-- toggle back to private has to overwrite what was there; a plan share has
-- no third state to preserve, so un-sharing simply deletes the row.
--
-- SECURITY: same posture as every other household table (0055). Server-only:
-- RLS on with a restrictive deny, no grants to anon/authenticated.

CREATE TABLE IF NOT EXISTS public.household_plan_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT household_plan_shares_unique UNIQUE (household_id, user_id, domain)
);
CREATE INDEX IF NOT EXISTS household_plan_shares_hid_idx
  ON public.household_plan_shares (household_id);

ALTER TABLE public.household_plan_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_plan_shares FROM anon, authenticated;
GRANT ALL ON public.household_plan_shares TO service_role;
DROP POLICY IF EXISTS household_plan_shares_no_client_access ON public.household_plan_shares;
CREATE POLICY household_plan_shares_no_client_access ON public.household_plan_shares
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Expect (run by hand after applying): the table exists, RLS is on, and a
-- direct select as anon/authenticated returns nothing.
--   SELECT count(*) FROM public.household_plan_shares; -- via service role: 0 (fresh)
