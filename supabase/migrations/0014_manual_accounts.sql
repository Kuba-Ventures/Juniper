-- Account discovery, tier 3: manually-added accounts.
-- Idempotent, safe to re-run.
--
-- For accounts Plaid can't link, small/regional banks, some employer 401(k)
-- providers, or anything a user simply prefers to enter by hand, so their net
-- worth and account list can be complete even without a live connection.
--
-- Like transactions/budgets (0008) this is the user's OWN data and IS
-- client-readable: GRANT to `authenticated` + owner RLS (auth.uid() = user_id),
-- same as plans (0002). No Plaid tokens live here. The API writes with the
-- service-role key (bypasses RLS), so it must scope every write by user_id
-- itself; the owner RLS below is defense-in-depth for any direct Data API read.

CREATE TABLE IF NOT EXISTS public.manual_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                    -- user's label, e.g. "Carter Bank checking"
  institution  TEXT,                             -- optional institution name, e.g. "Carter Bank & Trust"
  category     TEXT NOT NULL DEFAULT 'banking',  -- juniper category: banking | investing | credit | loans | cash | other
  kind         TEXT NOT NULL DEFAULT 'asset',    -- asset | liability (drives net-worth sign)
  balance      NUMERIC,                          -- current balance, positive; sign comes from `kind`
  currency     TEXT NOT NULL DEFAULT 'USD',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manual_accounts_category_check
    CHECK (category IN ('banking','investing','credit','loans','cash','other')),
  CONSTRAINT manual_accounts_kind_check
    CHECK (kind IN ('asset','liability'))
);

CREATE INDEX IF NOT EXISTS manual_accounts_user_id_idx ON public.manual_accounts (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_accounts TO authenticated;

ALTER TABLE public.manual_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_accounts_select_own ON public.manual_accounts;
CREATE POLICY manual_accounts_select_own ON public.manual_accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_accounts_insert_own ON public.manual_accounts;
CREATE POLICY manual_accounts_insert_own ON public.manual_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_accounts_update_own ON public.manual_accounts;
CREATE POLICY manual_accounts_update_own ON public.manual_accounts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_accounts_delete_own ON public.manual_accounts;
CREATE POLICY manual_accounts_delete_own ON public.manual_accounts
  FOR DELETE USING (auth.uid() = user_id);
