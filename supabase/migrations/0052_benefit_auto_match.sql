-- A narrow, honest exception to "Juniper does not detect use" (0031's own
-- comment on card_benefit_uses, and api/card-benefits.ts's header, which is left
-- standing rather than deleted: the rule is still correct for almost every
-- benefit in the catalog, and this migration is the record of why two rows are
-- the exception).
--
-- ---- WHY THESE TWO, AND WHY NOTHING ELSE -----------------------------------
--
-- Issue #264 asked for the difference to be drawn deliberately: "some are
-- auto-completable with confidence: a monthly credit with one obvious merchant,
-- where a charge in the window is as good as proof." Most of the catalog fails
-- that test on purpose. A dining credit good "at participating partners" or a
-- digital-entertainment credit good at "eligible purchases" names no merchant a
-- charge could be matched against; a $10,000 purchase-protection LIMIT is not a
-- credit a charge could ever satisfy at all. `amexp-uber-cash` and
-- `amexg-uber-cash` (migration 0044) are the opposite case: the credit is
-- literally "money back on Uber", the merchant is Uber and only Uber, and a
-- charge to Uber inside the tracked period is exactly what "used" means. No
-- other row in the catalog makes that claim as cleanly, so no other row gets
-- `auto_merchant` in this pass. Setting one is a per-row editorial decision, the
-- same kind `verified` already is, and it is deliberately not automatic from a
-- benefit's name or group.
--
-- ---- auto_merchant, ON THE CATALOG ROW --------------------------------------
--
-- Lowercase, matched as a case-insensitive substring of transactions.merchant_name
-- by api/_rewards.ts's matchAutoBenefits. The CHECK enforces the lowercase
-- convention at the source rather than trusting every future INSERT to remember
-- it. NULL, the default, is "not auto-completable", which both the two Uber Cash
-- rows lack today (their period is 'year', see 0044's own header on why: the $20
-- December bonus makes it not a clean monthly figure) and every other row keeps.
--
-- ---- source AND evidence, ON THE MEMBER'S OWN ROW ---------------------------
--
-- `card_benefit_uses` gains two columns rather than a new automatic-ticks table,
-- because a benefit is used or it is not, whichever ticked it: one row, one
-- meaning, same as today. `source` says how the row came to exist ('member', the
-- default and the only value before this migration, or 'auto'), and `evidence`
-- carries the matched charge as a READABLE STRING ("Uber · Mar 14 · $10.00")
-- rather than a transaction id, because a transaction can itself be corrected or
-- deleted later and the point of evidence is to say what Juniper saw AT THE TIME
-- it ticked the box, not to stay a live foreign key into a table that can change
-- out from under it. Evidence is NULL for every member-sourced row: there is
-- nothing to show, because the member is the evidence.
--
-- ---- card_benefit_dismissals, THE HALF THAT MAKES UNDO STICK ----------------
--
-- Without it, undoing an auto-tick would not survive the next page load: the
-- charge that produced it is still sitting in transactions, api/card-rewards.ts
-- would see it again on the next read, and a member's "not this one" would be
-- silently overwritten within a few seconds of them making it. This table is a
-- tombstone, the same shape #296's notifications reconcile already uses
-- (`status='cleared'`, never a real delete, so a dismissed-but-still-true fact
-- does not resurrect): a row here means "do not auto-tick this benefit for this
-- period again", checked by matchAutoBenefits's caller before it writes anything,
-- and it goes stale on its own the moment the period rolls over, because
-- period_key is part of what makes the row match. A member who taps the benefit
-- back on by hand afterwards still can: tick() in api/card-benefits.ts writes to
-- card_benefit_uses, not here, so a dismissal only ever suppresses the AUTOMATIC
-- path, never the member's own control over the same box.
--
-- Idempotent, safe to re-run.

ALTER TABLE public.card_product_benefits
  ADD COLUMN IF NOT EXISTS auto_merchant TEXT;

ALTER TABLE public.card_product_benefits
  DROP CONSTRAINT IF EXISTS card_product_benefits_auto_merchant_lowercase;
ALTER TABLE public.card_product_benefits
  ADD CONSTRAINT card_product_benefits_auto_merchant_lowercase
  CHECK (auto_merchant IS NULL OR auto_merchant = lower(auto_merchant));

UPDATE public.card_product_benefits
   SET auto_merchant = 'uber'
 WHERE id IN ('amexp-uber-cash', 'amexg-uber-cash');

ALTER TABLE public.card_benefit_uses
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.card_benefit_uses
  DROP CONSTRAINT IF EXISTS card_benefit_uses_source_check;
ALTER TABLE public.card_benefit_uses
  ADD CONSTRAINT card_benefit_uses_source_check CHECK (source IN ('member', 'auto'));

ALTER TABLE public.card_benefit_uses
  ADD COLUMN IF NOT EXISTS evidence TEXT;

CREATE TABLE IF NOT EXISTS public.card_benefit_dismissals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  benefit_id    TEXT NOT NULL REFERENCES public.card_product_benefits(id) ON DELETE CASCADE,
  period_key    TEXT NOT NULL,
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_benefit_dismissals_period_key_not_blank CHECK (length(btrim(period_key)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS card_benefit_dismissals_unique
  ON public.card_benefit_dismissals (user_id, benefit_id, period_key);
CREATE INDEX IF NOT EXISTS card_benefit_dismissals_user_id_idx
  ON public.card_benefit_dismissals (user_id);

GRANT SELECT, INSERT, DELETE ON public.card_benefit_dismissals TO authenticated;
ALTER TABLE public.card_benefit_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_benefit_dismissals_select_own ON public.card_benefit_dismissals;
CREATE POLICY card_benefit_dismissals_select_own ON public.card_benefit_dismissals
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS card_benefit_dismissals_insert_own ON public.card_benefit_dismissals;
CREATE POLICY card_benefit_dismissals_insert_own ON public.card_benefit_dismissals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS card_benefit_dismissals_delete_own ON public.card_benefit_dismissals;
CREATE POLICY card_benefit_dismissals_delete_own ON public.card_benefit_dismissals
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON COLUMN public.card_product_benefits.auto_merchant IS
  'Lowercase merchant substring matched against transactions.merchant_name. Set only where the credit names one unambiguous merchant a charge can prove (issue #264); NULL, the default, means "member ticks this by hand", which is nearly every row.';
COMMENT ON COLUMN public.card_benefit_uses.source IS
  '''member'' (default): the member tapped the checkbox. ''auto'': api/card-rewards.ts matched a charge to an auto_merchant benefit and wrote this row itself. Never rewritten once set.';
COMMENT ON COLUMN public.card_benefit_uses.evidence IS
  'Human-readable snapshot of the matched charge ("Uber · Mar 14 · $10.00"), set only when source=''auto''. Not a transaction id: the point is what Juniper saw at the moment it ticked the box, which must not change if that transaction is later corrected or removed.';
COMMENT ON TABLE public.card_benefit_dismissals IS
  'A member said "not this one" to an auto-matched benefit. One row suppresses re-matching that benefit for that period_key only; it goes stale on its own once the period rolls over. Does not affect the member ticking the same benefit by hand through api/card-benefits.ts, which writes to card_benefit_uses and never reads this table.';

-- Expect: 2 benefits carry auto_merchant ('uber' on both Uber Cash rows), every
-- card_benefit_uses row (there may be none yet, in which case both counts read
-- 0) carries source='member' with a NULL evidence, since nothing before this
-- migration could have written 'auto', and the dismissals table is empty.
SELECT
  (SELECT count(*) FROM public.card_product_benefits WHERE auto_merchant IS NOT NULL) AS auto_completable_benefits,
  (SELECT count(*) FROM public.card_benefit_uses WHERE source = 'auto')               AS auto_sourced_uses,
  (SELECT count(*) FROM public.card_benefit_uses WHERE source = 'member')             AS member_sourced_uses,
  (SELECT count(*) FROM public.card_benefit_dismissals)                              AS dismissals;
