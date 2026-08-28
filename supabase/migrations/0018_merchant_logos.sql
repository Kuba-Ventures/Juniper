-- Stage 3h: merchant art, from Plaid's own enrichment.
-- Idempotent, safe to re-run.
--
-- WHY NOT THE BUNDLED ART. lib/mock-logos.ts holds about two dozen brand images,
-- and on a real transaction feed it covers almost nothing: of the merchants on
-- one live account (PayPal, Amazon, Philips, Shell, DraftKings, The Market Bell
-- Air, Venmo, Harris Teeter) exactly one resolved. A curated list cannot keep up
-- with where people actually shop, and growing it by hand is the maintenance
-- debt that the institution gallery was deleted for in #139.
--
-- WHY NOT resolveInstitutionMark. That resolves INSTITUTIONS, keyed by Plaid
-- institution_id. A merchant is a different namespace and the two must not be
-- crossed: Chase the bank and a Chase-branded charge are not the same lookup.
--
-- THE SOURCE IS PLAID. Transactions already carry `logo_url` and `website` per
-- transaction, and per counterparty, at no extra product and no extra call. We
-- request Transactions today, so this is a column and a write, not an
-- integration.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS website  TEXT;

-- ── merchant_logos ──────────────────────────────────────────────────────────
-- A merchant-level cache, so art found on ONE transaction covers every other
-- transaction from the same merchant, including rows written before this
-- migration existed.
--
-- This is what avoids a full re-sync. /transactions/sync is incremental by
-- cursor, so existing rows are not revisited and would carry no logo forever.
-- Rather than nulling every cursor and replaying two years of history through an
-- edge function with a 25 second ceiling, the next charge from a merchant fills
-- in the art for all of that merchant's past charges at once. Recurring
-- merchants are exactly the ones a member sees most, so coverage arrives where
-- it matters first and grows on its own.
--
-- Keyed by merchant name, NOT by user: the mapping "Amazon -> this image" is a
-- fact about Amazon, so one member's feed filling it in helps everyone and the
-- table stays small. It is server-only for the same reason plaid_items is (0007):
-- no client grants and no permissive policy, because WHICH merchants appear here
-- is derived from members' spending even though the mapping itself is not
-- personal. It is only ever read through the user-scoped endpoints.
CREATE TABLE IF NOT EXISTS public.merchant_logos (
  merchant_name TEXT PRIMARY KEY,
  logo_url      TEXT,
  website       TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON public.merchant_logos FROM anon, authenticated;
ALTER TABLE public.merchant_logos ENABLE ROW LEVEL SECURITY;
-- No permissive policy on purpose: service_role bypasses RLS, everyone else
-- gets zero rows even with a valid JWT.
DROP POLICY IF EXISTS merchant_logos_no_client_access ON public.merchant_logos;
CREATE POLICY merchant_logos_no_client_access ON public.merchant_logos FOR SELECT USING (false);

-- public.touch_updated_at() is created in 0008.
DROP TRIGGER IF EXISTS merchant_logos_touch_updated_at ON public.merchant_logos;
CREATE TRIGGER merchant_logos_touch_updated_at
  BEFORE UPDATE ON public.merchant_logos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
