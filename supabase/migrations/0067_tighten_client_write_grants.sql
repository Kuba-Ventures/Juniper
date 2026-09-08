-- Issue #380: budgets, manual_accounts, and member_cards grant INSERT/UPDATE/
-- DELETE directly to `authenticated` at the table level, on top of the
-- service-role writes their own api/budgets.ts, api/manual-accounts.ts, and
-- api/member-cards.ts already perform. RLS confines any such write to the
-- caller's own rows (verified: no cross-user exposure), but a client calling
-- the Supabase Data API directly, bypassing those endpoints, could still
-- write a value the app layer would have rejected:
--   - member_cards: an arbitrary plaid_account_id not tied to a real linked
--     account, bypassing ownsCreditAccount() in api/member-cards.ts.
--   - budgets: an arbitrary category string outside the taxonomy, bypassing
--     the taxonomy validation in api/budgets.ts.
--   - manual_accounts: a credit_limit/product_id outside the format checks
--     api/manual-accounts.ts performs (the 0033/0046 CHECK constraints, e.g.
--     positive-only limit, credit-category-only, still hold as a floor
--     either way).
--
-- Confirmed before writing this migration, by reading every caller rather
-- than assuming it: no frontend code calls supabase.from(...) against any of
-- these three tables directly (artifacts/juniper/src grep, zero hits), and
-- every one of their own api/*.ts endpoints authenticates the caller's JWT
-- itself and then writes with the service-role key, which bypasses this
-- GRANT entirely. So the authenticated-role write grant on these three
-- tables was never exercised by the app; it was pure unused surface, the
-- exact shape issue #380 flagged. Revoking it forces every write through the
-- app's own validation with no functional change for a real member, the
-- same pattern `public.transactions` already uses in 0008 (GRANT SELECT,
-- UPDATE only, sync writes via service_role) and the pattern the
-- server-only tables (plaid_items, credit_consents) take to its strictest
-- extreme.
--
-- SELECT is deliberately left granted, unchanged from 0008/0014/0031: these
-- are ordinary client-readable, owner-RLS tables by design (0008's own
-- header calls this out explicitly), and issue #380 is a write-integrity
-- gap, not a confidentiality one. RLS policies for INSERT/UPDATE/DELETE are
-- left in place rather than dropped: without the table-level GRANT they are
-- simply never reached (Postgres checks GRANT before RLS), so leaving them
-- is inert now and costs nothing if a future feature ever needs to restore
-- direct client writes on purpose.
REVOKE INSERT, UPDATE, DELETE ON public.budgets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.manual_accounts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.member_cards FROM authenticated;

-- Expect: authenticated keeps SELECT only on all three tables; service_role
-- (used by the api/*.ts endpoints) is untouched since this REVOKE never
-- named it.
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('budgets', 'manual_accounts', 'member_cards')
    AND grantee IN ('authenticated', 'service_role')
  GROUP BY table_name, grantee
  ORDER BY table_name, grantee;
