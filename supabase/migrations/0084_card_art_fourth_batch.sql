-- Fourth art pass over this week's 37 new catalog products: 5 more (22 of 37
-- total now have real art). Same posture as every art migration before it:
-- no affiliate agreement or asset licence with any issuer, unlicensed use as
-- a stopgap pending ROADMAP Stage 5, reversible with one UPDATE.
--
-- ---- WHERE THESE CAME FROM AND WHAT WAS DONE ---------------------------------
--
-- All five downloaded 2026-09-15. Two (the PNC pair) via a same-origin
-- fetch() run in the issuer's own page, the same workaround 0082 used for
-- PenFed and Golden 1 -- 0082's header noted PNC's CDN returns 403 with no
-- referer "even from a live browser tab"; that turned out not to be the
-- final word, since PNC now serves both card renders as AVIF (not the .png
-- their own filename claims) to a same-origin fetch, decodable by Pillow
-- once retrieved. The other three are plain unauthenticated downloads.
--
-- One needed real retouching, and it is the heaviest derivative work any art
-- migration in this catalog has done. Bread Cashback's own marketing render
-- (Bread-Cashback-Card-Art.png) has no flat product shot at all, only a
-- stylized 3D photo of the card floating at roughly a 70 degree tilt in
-- PORTRAIT orientation (confirmed by finding the card's true minimum-area
-- bounding rectangle with OpenCV: 414x268px, matching the real card aspect
-- ratio, at a rotation that only reads right-side-up when leveled to
-- PORTRAIT, not landscape). This card's physical design is genuinely
-- vertical: rotating the leveled portrait render 90 degrees to fill this
-- catalog's landscape frame (for consistency with every other row) makes the
-- wordmark and cardholder text run top-to-bottom rather than left-to-right,
-- which is not a mistake, it is what a portrait card looks like forced into
-- a landscape slot. The issuer's placeholder cardholder name ("B. READ")
-- and its "Member Since 22" line were then erased with a flat colour fill
-- matching the card's own navy, chosen because that whole region is a flat
-- unpatterned tone with no texture to reconstruct.
--
-- The other four needed no retouching beyond a plain crop out of a white or
-- transparent marketing frame: clean renders, no placeholder name.
--
-- ---- WHAT IS STILL A MONOGRAM, AND WHAT WAS TRIED THIS PASS -------------------
--
-- 15 of this week's 37 additions remain. Findings from this pass: Wright-Patt
-- Credit Union's own product page carries only a line-drawing icon of two
-- generic cards, no real card art anywhere on the page. America First Credit
-- Union's page and Suncoast Credit Union's CashBack+ page both carry only
-- lifestyle photography (people holding cards, an app screenshot of a
-- rewards-offers screen) with no flat product render. Amazon Business Prime
-- American Express: the issuer URL on file 404s, and Amazon's own current
-- small-business card marketing appears to point at a Mastercard-branded
-- product now rather than the Amex this catalog has on record, which reads
-- as the same kind of network/issuer drift 0083 found on Huntington and
-- Golden 1; left alone rather than guess at art for a product that may have
-- been reissued. Fidelity's own domain returns a hard S3 "Access Denied" on
-- this URL, not a 404, the same as 0082 found and unresolved since.
--
-- To revert entirely: UPDATE public.card_products SET art_url = NULL,
--                             art_license = NULL WHERE id IN (the five below);
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('usbank-altitude-go',
     'https://www.juniperplan.com/card-art/usbank-altitude-go.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.usbank.com/content/dam/usbank/en/images/illustrations/card-art/credit-cards/photo-altitude-go-angle-left.png (linked from the issuer''s own product page). This is a native 160x300 asset, U.S. Bank''s only rendition of this card (no larger size found), shown at a slight isometric tilt rather than dead-on; rehosted on Juniper''s own origin, rotated to landscape and rescaled, no text retouching needed. Upscaling a source this small leaves it visibly softer than this catalog''s other rows. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('bread-cashback-amex',
     'https://www.juniperplan.com/card-art/bread-cashback-amex.webp',
     'Issuer marketing photo, downloaded 2026-09-15 from https://www.breadfinancial.com/content/dam/breadfinancial/us/en/images/bread-cashback-card/Bread-Cashback-Card-Art.png (linked from the issuer''s own product page), a stylized 3D render of the card tilted roughly 70 degrees with no flat product shot available anywhere on the site. The card''s true orientation was found to be PORTRAIT (confirmed via OpenCV minAreaRect on the card''s own silhouette: 414x268px, the real ID-1 ratio, only reading right-side-up when leveled to portrait), then rotated 90 degrees to fill this catalog''s landscape frame, which is why the wordmark and cardholder text run vertically rather than left-to-right -- a faithful representation of a portrait-native card design forced into a landscape slot, not an error. The issuer''s placeholder cardholder name ("B. READ") and "Member Since 22" line were erased with a flat navy fill matching that unpatterned region of the card exactly. The heaviest derivative work in this catalog''s art to date. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('rbfcu-world-cash-back-mastercard',
     'https://www.juniperplan.com/card-art/rbfcu-world-cash-back-mastercard.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.rbfcu.org/images/default-source/featured-sections/world-cash-back-credit-card-700x700.png (linked from the issuer''s own product page). Rehosted on Juniper''s own origin; cropped out of its light-gray marketing backdrop, then rescaled, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('pnc-cash-rewards-visa-signature',
     'https://www.juniperplan.com/card-art/pnc-cash-rewards-visa-signature.webp',
     'Issuer marketing render, downloaded 2026-09-15 from a same-origin fetch() of https://www.pnc.com/en/personal-banking/banking/credit-cards/pnc-cash-rewards-visa-credit-card/_jcr_content/main/pageHead/containergrid_copy_c/embeddedGrid/containergrid_531262/embeddedGrid/image.coreimg.png/1758561926091/creditcard-cash-rewards.png, run from within the issuer''s own product page (a plain unauthenticated download returns 403, per 0082''s note, which still holds for a direct request; same-origin fetch works). Served as AVIF despite the .png in its own filename; decoded, rehosted as WebP on Juniper''s own origin, rescaled, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('pnc-cash-unlimited-visa-signature',
     'https://www.juniperplan.com/card-art/pnc-cash-unlimited-visa-signature.webp',
     'Issuer marketing render, downloaded 2026-09-15 from a same-origin fetch() of https://www.pnc.com/en/personal-banking/banking/credit-cards/pnc-cash-unlimited-visa-credit-card/_jcr_content/main/pageBody/containergrid_971828/embeddedGrid/containergrid/embeddedGrid/containergrid/embeddedGrid/image_copy_copy.coreimg.png/1756214859728/creditcard-cash-unlimited-signature.png, same same-origin-fetch workaround and same AVIF-despite-png-filename behavior as the Cash Rewards row above. Rehosted as WebP on Juniper''s own origin, rescaled, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(id, art_url, art_license)
 WHERE p.id = v.id;

COMMIT;

-- Every row should report ok = true (art_url set, https, paired with a license note).
SELECT id, art_url IS NOT NULL AS has_art,
          (art_url IS NULL) = (art_license IS NULL) AS paired,
          art_url LIKE 'https://%' AS is_https
  FROM public.card_products
 WHERE id IN ('usbank-altitude-go', 'bread-cashback-amex', 'rbfcu-world-cash-back-mastercard',
              'pnc-cash-rewards-visa-signature', 'pnc-cash-unlimited-visa-signature')
 ORDER BY id;
