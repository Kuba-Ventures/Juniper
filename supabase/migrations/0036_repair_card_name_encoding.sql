-- Repair the mangled trademark symbols in card names. Idempotent, safe to re-run.
--
-- === WHAT WENT WRONG, WHICH WAS NOT THE MIGRATIONS =========================
--
-- 0032 and 0034 are correctly encoded UTF-8: the byte sequence for the registered
-- sign in "Chase Freedom Unlimited(R)" is C2 AE in both files, verified. The
-- corruption happened IN TRANSIT. The SQL was moved to the Supabase editor
-- through the macOS clipboard, which carried raw UTF-8 bytes without declaring an
-- encoding, and something on the way in read them as MacRoman: C2 became the not
-- sign and AE became the AE ligature. So the picker rendered
-- "Chase Freedom Flex" followed by two pieces of punctuation instead of one
-- symbol, on thirteen product names.
--
-- Only `card_products.name` is affected. Nothing in the notes, details or benefit
-- rows contains a character above ASCII, which is why this repair is thirteen
-- statements rather than a sweep.
--
-- === WHY EVERY SPECIAL CHARACTER HERE IS BUILT WITH chr() ==================
--
-- This file contains no byte above ASCII at all, deliberately, including in its
-- comments: the section rules are plain hyphens rather than the box-drawing
-- characters every other migration here uses, because a file whose job is
-- surviving a lossy transfer should not itself contain anything a lossy transfer
-- can break. Writing the symbol as a literal would put the exact sequence that got
-- mangled back onto the clipboard, and the repair would arrive as broken as the
-- thing it repairs. `chr(174)` is the
-- registered sign and `chr(8480)` is the service mark in a UTF8 database, and
-- both survive any transfer that preserves ASCII.
--
-- THE CONVENTION THAT FOLLOWS: a future card seed should use chr() for anything
-- above ASCII rather than a literal, or be applied by a tool that declares its
-- encoding (the Supabase CLI, or psql with a file) rather than pasted.
--
-- === WHY SET RATHER THAN REPLACE ==========================================
--
-- Replacing the mangled sequence would need this file to know what the mangling
-- produced, and there is more than one plausible answer depending on which
-- encoding did the misreading. Setting the whole name from a known-good value
-- needs no such guess and is correct whether the row is mangled, already fixed, or
-- was never broken, which is what makes it re-runnable. `WHERE name <> <target>`
-- keeps it from touching rows that are already right, so a re-run reports zero.

UPDATE public.card_products SET name = 'Chase Freedom Unlimited' || chr(174)
  WHERE id = 'chase-freedom-unlimited' AND name <> 'Chase Freedom Unlimited' || chr(174);

UPDATE public.card_products SET name = 'Chase Freedom Flex' || chr(174)
  WHERE id = 'chase-freedom-flex' AND name <> 'Chase Freedom Flex' || chr(174);

UPDATE public.card_products SET name = 'Chase Sapphire Preferred' || chr(174) || ' Card'
  WHERE id = 'chase-sapphire-preferred'
    AND name <> 'Chase Sapphire Preferred' || chr(174) || ' Card';

UPDATE public.card_products SET name = 'Discover it' || chr(174) || ' Cash Back'
  WHERE id = 'discover-it-cash-back'
    AND name <> 'Discover it' || chr(174) || ' Cash Back';

UPDATE public.card_products SET name = 'Discover it' || chr(174) || ' Chrome'
  WHERE id = 'discover-it-chrome'
    AND name <> 'Discover it' || chr(174) || ' Chrome';

UPDATE public.card_products
  SET name = 'Blue Cash Preferred' || chr(174) || ' Card from American Express'
  WHERE id = 'amex-blue-cash-preferred'
    AND name <> 'Blue Cash Preferred' || chr(174) || ' Card from American Express';

UPDATE public.card_products SET name = 'Citi Double Cash' || chr(174) || ' Card'
  WHERE id = 'citi-double-cash'
    AND name <> 'Citi Double Cash' || chr(174) || ' Card';

UPDATE public.card_products SET name = 'Wells Fargo Active Cash' || chr(174) || ' Card'
  WHERE id = 'wells-fargo-active-cash'
    AND name <> 'Wells Fargo Active Cash' || chr(174) || ' Card';

UPDATE public.card_products SET name = 'Discover it' || chr(174) || ' Student Cash Back'
  WHERE id = 'discover-it-student-cash-back'
    AND name <> 'Discover it' || chr(174) || ' Student Cash Back';

UPDATE public.card_products SET name = 'Discover it' || chr(174) || ' Miles'
  WHERE id = 'discover-it-miles'
    AND name <> 'Discover it' || chr(174) || ' Miles';

UPDATE public.card_products SET name = 'Chase Freedom Rise' || chr(174)
  WHERE id = 'chase-freedom-rise' AND name <> 'Chase Freedom Rise' || chr(174);

UPDATE public.card_products
  SET name = 'Blue Cash Everyday' || chr(174) || ' Card from American Express'
  WHERE id = 'amex-blue-cash-everyday'
    AND name <> 'Blue Cash Everyday' || chr(174) || ' Card from American Express';

-- chr(8480) is the service mark, which Wells Fargo uses on Autograph rather than
-- the registered sign. It mangles the same way and needs the same treatment.
UPDATE public.card_products SET name = 'Wells Fargo Autograph' || chr(8480) || ' Card'
  WHERE id = 'wells-fargo-autograph'
    AND name <> 'Wells Fargo Autograph' || chr(8480) || ' Card';

-- Verification, safe to leave in: every row should come back with `ok` true. A
-- false means the transfer mangled this file too, which is exactly what building
-- the symbols from chr() is meant to prevent.
SELECT id,
       name,
       (name ~ ('[' || chr(174) || chr(8480) || ']')) AS has_symbol,
       (name !~ ('[' || chr(172) || chr(194) || ']')) AS ok
FROM public.card_products
WHERE id IN (
  'chase-freedom-unlimited','chase-freedom-flex','chase-sapphire-preferred',
  'discover-it-cash-back','discover-it-chrome','amex-blue-cash-preferred',
  'citi-double-cash','wells-fargo-active-cash','discover-it-student-cash-back',
  'discover-it-miles','chase-freedom-rise','amex-blue-cash-everyday',
  'wells-fargo-autograph'
)
ORDER BY id;
