-- Stage 3g: per-item sync state, so freshness and breakage are facts rather
-- than inferences.
-- Idempotent, safe to re-run.
--
-- WHY THIS EXISTS. Refresh is moving from a button the member presses to
-- something the app does on its own, and two questions have to be answerable on
-- a plain page load, with no Plaid call:
--
--   1. "How current is this?"  -> last_synced_at
--   2. "Is anything broken?"   -> last_error_code / last_error_at
--
-- Until now both answers only existed inside the response body of a sync the
-- member had just triggered. `needs_relink` was computed live and thrown away,
-- so a page load could not tell a connection whose login had expired from one
-- that was simply quiet. Persisting it is what lets the Connections page name
-- the one bank that needs attention instead of offering a Refresh button that
-- cannot fix it.
--
-- These live on plaid_items, which is the SERVER-ONLY token store from 0007: no
-- client grants, RLS with no permissive policy, service_role only. Nothing here
-- changes that. The values reach the client through /api/finances, which reads
-- them with the service-role key and returns only what is safe to show.

ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS last_synced_at  TIMESTAMPTZ;
ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS last_error_at   TIMESTAMPTZ;

-- Existing rows get a starting point rather than a NULL that would read as
-- "never synced" and trigger an immediate refresh for every member on their next
-- load. `updated_at` is when the stored account snapshot was last rewritten,
-- which is exactly what a successful balance refresh does, so it is the honest
-- backfill value.
UPDATE public.plaid_items SET last_synced_at = updated_at WHERE last_synced_at IS NULL;
