-- Removes the Spinwheel sandbox credit-score integration (Stage 10b-10f) and
-- replaces it with a self-reported score, the same honest-self-report shape
-- 0068's paycheck fields and 0033/0046's member-typed credit limit already
-- are.
--
-- ---- WHY ----------------------------------------------------------------
--
-- No credit-bureau provider researched in docs/CREDIT_PROVIDER.md offers a
-- free production API: every one of them (Equifax, Spinwheel, CRS, Method)
-- gates real access behind a sales contract, and SPINWHEEL_ENV was never
-- flipped off "sandbox" because that contract was never signed. So every
-- pull the Credit page ever showed, even the ones driven by a genuine
-- per-member SMS-OTP-verified consent (Stage 10c/10d), returned Spinwheel's
-- own canned sandbox fixture, never a member's real score. A member already
-- has a free real number from Credit Karma or their own bank's app; this
-- lets them type it in instead of showing them a fake one.
--
-- ---- WHAT DROPS AND WHY IT'S SAFE TO DROP ---------------------------------
--
-- credit_consents (0065, widened by 0066) held the Spinwheel identity, the
-- OTP-verification proof, and the last-seen-score baseline for score-change
-- alerting. None of that has a use once nothing pulls from Spinwheel: the
-- identity is meaningless with no provider to look it up against, and the
-- baseline has nothing to diff against. It is server-write-only (no client
-- could ever have read it directly), so dropping it cannot orphan a client
-- read. notifications.kind keeps 'score_change' as an allowed value (0066):
-- nothing ever inserts one again, which is a harmless unused enum member,
-- not a stale reference to a dropped table.
--
-- ---- WHY THIS NEVER REACHES THE JUNIPER SCORE -----------------------------
--
-- Same rule 0033/0046 and 0068's deduction columns already draw: a number
-- the member typed must never move a score Juniper asserts about them, or
-- the member is scoring themselves. api/_finance-snapshot.ts stops reading
-- credit_consents.last_score into ScoreInput.creditScore in the same change
-- that applies this migration; these three columns are read nowhere near
-- that function, and no future reader should join them in without rereading
-- this comment first.
--
-- ---- WHY THIS ISN'T A GROWING HISTORY TABLE -------------------------------
--
-- Same call migration 0066 made for the Spinwheel baseline: one row, not a
-- table, because a member's own score trend (if ever built) is a separate,
-- later feature with a real reason to keep more than one value. The `as_of`
-- date is what the member says they last checked, not a write timestamp.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS credit_score_self SMALLINT,
  ADD COLUMN IF NOT EXISTS credit_score_source TEXT,
  ADD COLUMN IF NOT EXISTS credit_score_as_of DATE;

-- A score outside 300-850 is not something anybody's real bureau report
-- would show, on any common model. Guard rather than trust, since this
-- arrives from a text field like every other self-reported number here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_credit_score_self_range'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_credit_score_self_range
      CHECK (credit_score_self IS NULL OR (credit_score_self >= 300 AND credit_score_self <= 850));
  END IF;
END $$;

DROP TABLE IF EXISTS public.credit_consents;
