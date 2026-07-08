-- Stage 7: Plaid Items (linked bank / investment accounts).
-- Idempotent — safe to re-run.
--
-- SECURITY — this table is the DELIBERATE INVERSE of every other table here.
-- A Plaid access_token can read a user's bank data, so it must NEVER be
-- reachable by the browser. Every other table grants SELECT to `authenticated`
-- and relies on RLS (auth.uid() = user_id) so the client can read its own rows
-- via PostgREST with the user JWT. Here we do the OPPOSITE: NO grants to anon /
-- authenticated at all, so the Data API returns nothing for a user JWT. The
-- table is reached ONLY from server-side Edge functions using the Supabase
-- service-role key, which bypasses RLS. The client only ever sees sanitized
-- account snapshots returned by /api/plaid/accounts — never the access_token.

CREATE TABLE IF NOT EXISTS public.plaid_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id           TEXT NOT NULL UNIQUE,
  access_token      TEXT NOT NULL,          -- SERVER ONLY. Never exposed to client.
  institution_id    TEXT,
  institution_name  TEXT,
  -- Sanitized account snapshot (name, mask, type, subtype, balances). No
  -- tokens/numbers. Safe to return to the owning client via the Edge function.
  accounts          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plaid_items_user_id_idx ON public.plaid_items (user_id);

-- ── Access control ──────────────────────────────────────────────────────────
-- Lock the table down to server-side (service_role) access only. RLS is enabled
-- as defense-in-depth; with no permissive policy, even a leaked user JWT reading
-- via PostgREST gets zero rows. service_role bypasses RLS.
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plaid_items FROM anon, authenticated;
GRANT ALL ON public.plaid_items TO service_role;

-- No policies for anon/authenticated on purpose. (Explicit restrictive policy so
-- intent is obvious in the dashboard and any future permissive policy still can't
-- expose the token column without also being reasoned about.)
DROP POLICY IF EXISTS plaid_items_no_client_access ON public.plaid_items;
CREATE POLICY plaid_items_no_client_access ON public.plaid_items
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_plaid_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plaid_items_touch_updated_at ON public.plaid_items;
CREATE TRIGGER plaid_items_touch_updated_at
  BEFORE UPDATE ON public.plaid_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_plaid_items_updated_at();
