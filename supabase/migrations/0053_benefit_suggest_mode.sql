-- Extends 0052's auto-match with a SECOND mode: suggest, don't tick.
--
-- 0052 drew a narrow line: auto_merchant only on a benefit where the charge
-- IS the credit, restated (Amex Uber Cash, merchant "uber"). Finley asked for
-- more than that line allows: a suggestion for the $50 Chase Sapphire
-- Preferred hotel credit (csp-travel-credit), where a charge to Chase Travel
-- is real evidence a booking happened but not proof the $50 credit was
-- applied to it -- exactly the gap 0052's own header names as the reason
-- nothing else in the catalog gets auto_merchant. The gap does not go away;
-- it gets a UI instead of an auto-tick: the member sees the same evidence
-- and taps to confirm, the same "never let a match be the only thing
-- claiming a credit was used" rule the Uber Cash rows already follow, just
-- with the confirmation moved from api/card-rewards.ts to the member.
--
-- auto_mode makes the two paths one column apart rather than a second table.
-- 'tick' (the default, unchanged behavior for the two Uber Cash rows) writes
-- card_benefit_uses itself, as today. 'suggest' surfaces the match on the
-- TrackedBenefit row as `suggestedEvidence` and writes nothing until the
-- member taps "Yes, used it", which is then a plain member tick like any
-- other on this checklist. "Not this" reuses card_benefit_dismissals
-- unchanged: the same tombstone that stops an auto-tick resurfacing also
-- stops a dismissed suggestion resurfacing, because both are checked the
-- same way -- before anything is shown or written, for this benefit and
-- period.
--
-- Idempotent, safe to re-run.

ALTER TABLE public.card_product_benefits
  ADD COLUMN IF NOT EXISTS auto_mode TEXT NOT NULL DEFAULT 'tick';

ALTER TABLE public.card_product_benefits
  DROP CONSTRAINT IF EXISTS card_product_benefits_auto_mode_check;
ALTER TABLE public.card_product_benefits
  ADD CONSTRAINT card_product_benefits_auto_mode_check CHECK (auto_mode IN ('tick', 'suggest'));

UPDATE public.card_product_benefits
   SET auto_merchant = 'chase travel', auto_mode = 'suggest'
 WHERE id = 'csp-travel-credit';

-- Expect: auto_mode = 'tick' on amexp-uber-cash and amexg-uber-cash (unchanged
-- from 0052), auto_mode = 'suggest' with auto_merchant = 'chase travel' on
-- csp-travel-credit, and auto_mode = 'tick' with auto_merchant NULL on every
-- other row.
