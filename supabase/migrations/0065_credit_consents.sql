-- Stage 10d: the durable record that a member authorized a credit pull, plus
-- the Spinwheel identity that authorization is tied to. Server-only, same
-- shape as 0007_plaid_items and for the same reason: a member's own client
-- must never be able to write a row here directly, because a row in this
-- table IS the legal claim that a real SMS OTP was verified before Juniper
-- (via Spinwheel) obtained their credit profile. If an authenticated client
-- could INSERT its own "I consented" row, the table would prove nothing.
-- Only api/credit/verify.ts (service-role, after Spinwheel's own OTP
-- verification succeeds) is allowed to write one.
--
-- ---- WHAT IS RETAINED, AND WHAT DELIBERATELY IS NOT -----------------------
--
-- Per the Stage 10d plan: retain the CONSENT record long term (FCRA-adjacent
-- recordkeeping norms run ~6 years; no automated deletion is built here,
-- since a retention SCHEDULE is an ops/legal decision, not a migration), and
-- never retain the credit REPORT past the display session (api/credit/score.ts
-- pulls live on every call and stores nothing from the response).
--
-- So this table holds only what proves the grant happened: who, when, which
-- Spinwheel identity the pull runs against, and the last 4 of the phone
-- number used (enough to help a member recognize which number they used if
-- there's ever a dispute, not the full number, and never the date of birth
-- collected alongside it, which has no reason to be retained once the
-- identity match that used it has already happened).
CREATE TABLE IF NOT EXISTS public.credit_consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spinwheel_user_id TEXT NOT NULL,
  phone_last4       TEXT NOT NULL CHECK (phone_last4 ~ '^[0-9]{4}$'),
  consented_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One Spinwheel identity per member: a second consent flow re-verifies and
-- updates the existing row (a member's phone number can change) rather than
-- accumulating a duplicate identity to pull against.
CREATE UNIQUE INDEX IF NOT EXISTS credit_consents_user_unique
  ON public.credit_consents (user_id);

-- ── Access control ──────────────────────────────────────────────────────────
-- Same lockdown as plaid_items: RLS enabled, no policy for anon/authenticated,
-- service_role only. A member reads their own consent status through
-- api/credit/score.ts (which already authenticates them), not by querying this
-- table directly.
ALTER TABLE public.credit_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.credit_consents FROM anon, authenticated;
GRANT ALL ON public.credit_consents TO service_role;

DROP POLICY IF EXISTS credit_consents_no_client_access ON public.credit_consents;
CREATE POLICY credit_consents_no_client_access ON public.credit_consents
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.credit_consents IS
  'Stage 10d: durable proof a member authorized a Spinwheel credit pull (server-write only, via api/credit/verify.ts after a real SMS OTP verification). Holds the consent record and the resulting spinwheel_user_id, never the credit report itself and never the date of birth used to establish identity match.';
