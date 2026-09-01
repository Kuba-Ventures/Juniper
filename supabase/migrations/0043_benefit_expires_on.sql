-- An end date for a benefit, so a promotion can be recorded without becoming
-- permanent.
--
-- ---- WHY ------------------------------------------------------------------
--
-- A benefit row had no way to say when it stops. That is fine for the durable
-- kind -- lounge access, primary rental coverage, an annual travel credit that
-- renews for as long as you hold the card -- and wrong for the large and growing
-- number of card perks that carry a stated expiry.
--
-- The Chase Sapphire Reserve alone has five, and between them they are most of
-- what its $795 fee buys:
--
--   $300 in DoorDash promos, $120 DashPass       through 12/31/2027
--   $300 in StubHub credits                     through 12/31/2027
--   Apple TV and Apple Music subscriptions       through 6/22/2027
--   $120 Lyft credits                            through 9/30/2027
--   $120 Peloton credits                         through 12/31/2027
--   $250 select Chase Travel hotel credit        through 12/31/2026
--
-- Without this column those had to be left out of 0044 entirely, because a
-- tracker that cannot represent an ending would still be telling somebody in 2028
-- to go and use a StubHub credit that stopped existing. Omitting them understated
-- the card; including them would have misled. Neither is acceptable when the
-- number in question is whether a $795 fee is worth paying.
--
-- ---- WHAT USES IT ---------------------------------------------------------
--
-- `trackBenefits` in api/_rewards.ts already takes `today`, so the filter lives
-- there: a benefit whose `expires_on` has passed is dropped before it reaches the
-- tracker, the summary, or the unused-value total. One definition, so the count in
-- the header and the rows underneath can never disagree.
--
-- The date is also sent to the client, so a benefit that is ending can say so
-- rather than vanishing without explanation on the day it lapses.
--
-- NULL means "no stated end date", which is the honest default and what every row
-- before today means. It is not the same as "renews forever" -- an issuer can
-- withdraw a perk whenever it likes -- it means the issuer has not published an
-- end date, which is all the catalog can know.
--
-- Idempotent, safe to re-run.

ALTER TABLE public.card_product_benefits
  ADD COLUMN IF NOT EXISTS expires_on DATE;

CREATE INDEX IF NOT EXISTS card_product_benefits_expires_idx
  ON public.card_product_benefits (expires_on)
  WHERE expires_on IS NOT NULL;

-- Expect: 50 benefits, all with expires_on NULL, because nothing recorded before
-- today had an end date to record.
SELECT count(*)                                        AS benefits,
       count(*) FILTER (WHERE expires_on IS NULL)       AS no_end_date,
       count(*) FILTER (WHERE expires_on IS NOT NULL)   AS with_end_date
  FROM public.card_product_benefits;
