-- A single visual treatment, run across every card image in the catalog, so the
-- deck reads as one family rather than 34 photographs shot under 34 different
-- lights. Issue #249, follow-up to the "clean up the design" ask. Idempotent,
-- safe to re-run.
--
-- ---- WHAT WAS DONE, AND WHAT WAS DELIBERATELY NOT DONE ---------------------
--
-- Three treatments were rendered on four representative cards (a dark
-- photo-real Chase render, a flat Capital One gradient, an engraved Amex
-- portrait, a brushed-metal Discover card) and reviewed before any of the 34
-- files were touched: a light-touch contrast/vignette normalization only, this
-- same normalization plus a subtle pine/cream split-tone, and a full duotone
-- recolor into one pine-to-gold gradient. The duotone read as the most
-- "designed," and was rejected anyway: it replaces each issuer's actual card
-- color (a member's real blue Chase card, a real orange Capital One card) with
-- the same pine-green for every card, which cuts directly against the reason
-- real art shipped in the first place (docs/CARD_REWARDS.md: "a colour chip
-- tells somebody almost nothing when they're choosing between five Capital One
-- cards"). The split-tone option was chosen instead: every card keeps its real
-- hue, only the lighting and contrast are unified.
--
-- The transform, applied identically to all 34 files, no per-card judgment:
--   1. Auto-contrast (1% cutoff) so no card reads darker or flatter than its
--      neighbours purely because the issuer's own render was shot that way.
--   2. A subtle split-tone: shadows lean toward Juniper's pine-dark
--      (#12261E-ish), highlights lean toward a warm cream, at about 14%
--      strength, so the set feels shot under one light without overriding any
--      card's actual color identity.
--   3. +5% contrast, +4% saturation, and a light edge vignette (darkens by at
--      most 10% at the extreme corners, nothing in the central ~60%).
--
-- Non-destructive to what the photography IS: no cropping changed, no aspect
-- ratio changed, no element removed or added. Purely a color-grade pass on top
-- of the retouching each file's own art_license already documents (ribbon
-- removal, cardholder-name erasure, margin-trim). Reverting the grade means
-- re-deriving the file from the issuer source URL already on record below and
-- redoing only that file's own documented retouch; no local untreated copy is
-- kept in the repo.
--
-- Pure ASCII, per docs/CARD_REWARDS.md's account of the clipboard-mangling
-- incident.

BEGIN;

UPDATE public.card_products
   SET art_license = art_license
     || ' Additionally, 2026-09-15: a uniform "cohesive grade" treatment was run across the whole catalog for visual consistency across issuers (contrast normalized, a subtle pine/cream split-tone, a light edge vignette), the identical transform applied to every row with no per-card judgment calls. Does not change crop, aspect ratio, or any element of the underlying render; each issuer''s own card color is unchanged.'
 WHERE id IN (
    'amex-blue-cash-everyday', 'amex-blue-cash-preferred', 'amex-gold', 'amex-platinum',
    'bofa-travel-rewards', 'bofa-unlimited-cash-rewards',
    'capital-one-quicksilver', 'capital-one-quicksilver-student', 'capital-one-savor',
    'capital-one-savorone', 'capital-one-venture', 'capital-one-venture-x',
    'chase-amazon-visa', 'chase-doordash', 'chase-freedom-flex', 'chase-freedom-rise',
    'chase-freedom-unlimited', 'chase-ink-business-cash', 'chase-ink-business-preferred',
    'chase-ink-business-premier', 'chase-ink-business-unlimited', 'chase-instacart',
    'chase-prime-visa', 'chase-sapphire-preferred', 'chase-sapphire-reserve',
    'chase-sapphire-reserve-business', 'chase-slate-edge',
    'citi-double-cash',
    'discover-it-cash-back', 'discover-it-chrome', 'discover-it-miles', 'discover-it-student-cash-back',
    'wells-fargo-active-cash', 'wells-fargo-autograph'
  )
  AND art_url IS NOT NULL
  AND art_license NOT LIKE '%cohesive grade%';

COMMIT;

-- Expect 32 rows updated today (the 2 bofa- ids no-op until migration 0069 is
-- applied; re-running this migration after 0069 lands picks them up too,
-- since the NOT LIKE guard only skips rows already carrying this note).
SELECT count(*) AS carries_note
  FROM public.card_products
 WHERE art_license LIKE '%cohesive grade%';
