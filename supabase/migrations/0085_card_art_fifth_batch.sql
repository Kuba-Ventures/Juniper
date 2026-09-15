-- Fifth art pass over this week's 37 new catalog products: 1 more (23 of 37
-- total now have real art). Same posture as every art migration before it:
-- no affiliate agreement or asset licence with any issuer, unlicensed use as
-- a stopgap pending ROADMAP Stage 5, reversible with one UPDATE.
--
-- This pass went back over all 16 remaining cards from 0081-0084 with fresh
-- URLs and fresh searches rather than just the ones nobody had tried, since
-- several of 0082-0084's "not found" notes turned out to be issuer pages that
-- had simply moved. One of those re-checks paid off; the other 15 confirm
-- the same dead ends 0081-0084 already found, or a new, different dead end.
--
-- ---- THE ONE ADDED ---------------------------------------------------------
--
-- USAA PREFERRED CASH REWARDS VISA SIGNATURE: the URL on file 404s (USAA
-- restructured its credit-card pages since this catalog's source_url was
-- recorded), but the current card-lineup page at usaa.com/banking/
-- credit-cards-public/ carries a clean flat render with no placeholder name.
--
-- ---- FIFTEEN CONFIRMED DEAD ENDS, EACH RE-CHECKED THIS PASS -----------------
--
-- Three Amex personal/business cards (amex-green, amex-everyday-preferred,
-- amex-business-green-rewards): every individual Amex card URL on file now
-- redirects to one generic compare-and-apply page listing only three
-- "featured" cards (Platinum, Gold, Blue Cash Preferred); Green is not among
-- them and no per-card page could be found at all. This is a harder dead end
-- than 0082/0083's "renders client-side" finding: the pages themselves are
-- gone, not merely hard to scrape.
--
-- USAA REWARDS AMEX: found the current USAA Amex card, but it is not the
-- same product. USAA's page for it (Cashback Rewards Plus American Express)
-- pays 5% gas / 3% groceries / 1% other, a flat cash-back structure,
-- against this catalog's row, which is a 3x dining / 2x gas / 2x groceries
-- POINTS card. Unlike the Golden 1 and Huntington name-only drifts 0083
-- found, this is a materially different reward structure on a materially
-- different card, not a rename; shipping this art under the old row's rate
-- would misrepresent both. Left alone; the row would need a full data
-- migration (rate, points-to-cash-back, name), not an art-only one.
--
-- CITIZENS CASH BACK PLUS: confirmed for certain this pass. Citizens' own
-- current lineup page has real, clean flat art for all four of its LIVE
-- cards (Summit, Summit Reserve, Spring, Amp) -- so the technique works
-- fine on this issuer -- but Cash Back Plus itself is retired and replaced
-- by Summit, whose real rate (3% dining/groceries, 1.5% elsewhere, tiered)
-- does not match this row's flat 1.8%. Same reasoning as USAA Rewards above:
-- a real rate change, not a rename, so left alone rather than reassigned.
--
-- WELLS FARGO BUSINESS PLATINUM: confirmed again dead. The direct URL 404s
-- and Wells Fargo's current business-card lineup page
-- (creditcards.wellsfargo.com/business-credit-cards/) lists only Signify
-- Business Cash; no Platinum product exists to find art for.
--
-- AMAZON BUSINESS PRIME AMEX: confirmed again dead. The Amex URL on file
-- 404s; Amazon's own credit-and-payment-cards category page on amazon.com
-- has no "Business Prime" listing at all. Consistent with 0084's finding
-- that this product may have been reissued under a different network;
-- nothing found this pass to confirm or deny that theory further.
--
-- DISCOVER IT BUSINESS: confirmed again dead, and now with a reason: the
-- business-card URL and a guessed discover.com/business/ path both land on
-- Discover's own "Page Not Found" page, which states outright that some
-- Discover site sections now redirect to Capital One (Discover's acquirer).
-- Business cards appear to be mid-migration between the two sites.
--
-- M&T VISA SIGNATURE: confirmed again dead. The page has no `<img>` or
-- `<source>` card render anywhere, and a CSS background-image sweep finds
-- only the same lifestyle stock photo 0082 already noted.
--
-- NAVY FEDERAL CASHREWARDS: confirmed dead, with a clearer picture of why.
-- The page's own "cropped hero" SVG (a different asset than the "dual" one
-- 0082 found) was fetched and rendered directly: it is still two cards
-- (cashRewards and cashRewards Plus, a DIFFERENT product) shown overlapping
-- at an angle, and the front card's own top-right corner is hidden behind
-- the card behind it. Unlike PayPal (0083) or Bread (0084), where the whole
-- card was visible just tilted, this card is genuinely missing a corner of
-- its own pixels behind another object, which de-skewing cannot recover.
--
-- SOFI CREDIT CARD, AMERICA FIRST PLATINUM REWARDS VISA, SUNCOAST CASHBACK+
-- VISA, WRIGHT-PATT PLATINUM REWARDS VISA: confirmed again dead on fresh
-- URLs (America First and Suncoast's actual current credit-card listing
-- pages this time, not the specific-card pages 0084 checked). All four
-- carry only lifestyle photography, an abstract non-representative 3D
-- render (SoFi), or a generic line-drawing icon (Wright-Patt); no flat
-- product render exists on any of the four sites.
--
-- FIDELITY REWARDS VISA SIGNATURE: not re-attempted this pass; 0082 and
-- 0084 both found a hard S3 "Access Denied" rather than a 404, which reads
-- as a deliberate hotlink block rather than a moved page, so a fresh URL
-- search would not help the way it did for USAA.
--
-- To revert entirely: UPDATE public.card_products SET art_url = NULL,
--                             art_license = NULL WHERE id = 'usaa-preferred-cash-rewards';
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('usaa-preferred-cash-rewards',
     'https://www.juniperplan.com/card-art/usaa-preferred-cash-rewards.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://static.usaa.com/content/dam/digital/images/preferred-cash-rewards-visa-signature-credit-card-flat-new-look-v1.png (linked from the issuer''s current card-lineup page, usaa.com/banking/credit-cards-public/, since the catalog''s recorded source_url now 404s -- USAA restructured its credit-card URLs since this row was researched). Rehosted on Juniper''s own origin; cropped out of its light-gray marketing frame, then rescaled, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(id, art_url, art_license)
 WHERE p.id = v.id;

COMMIT;

-- Row should report ok = true (art_url set, https, paired with a license note).
SELECT id, art_url IS NOT NULL AS has_art,
          (art_url IS NULL) = (art_license IS NULL) AS paired,
          art_url LIKE 'https://%' AS is_https
  FROM public.card_products
 WHERE id = 'usaa-preferred-cash-rewards';
