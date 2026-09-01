-- Which card holder the member wants their cards drawn in.
--
-- ---- WHY A COLUMN AND NOT localStorage -----------------------------------
--
-- Dark mode is stored in localStorage (`juniper_theme`) and that is right for
-- it: a theme is a property of the SCREEN you are looking at, so wanting dark on
-- a phone at night and light on a desktop at noon is coherent.
--
-- A card holder is not that. It is a thing the member picked because they liked
-- it, the same way somebody picks a wallet, and a wallet that changed when you
-- opened your laptop would be a bug. So it travels with the member.
--
-- ---- WHY THE VALUES ARE MATERIALS ----------------------------------------
--
-- cognac, black, saffiano, canvas, metal, minimal. Organised by what the holder
-- is made of, which is how the member would describe the one they want and how
-- anybody selling wallets arranges them.
--
-- Deliberately NOT organised by who the member is. A gendered split would make
-- somebody sort themselves into a bucket before they could find a look they
-- like, and the bucket does not predict the answer: the same range of holders is
-- reachable either way, and only one of the two arrangements asks a question
-- that has nothing to do with wallets.
--
-- ---- WHY NULL IS A REAL VALUE --------------------------------------------
--
-- NULL means "has not chosen", which is every row that exists today, and it
-- renders the default holder. It is NOT the same as choosing the default
-- explicitly: a member who picks `minimal` on purpose should keep it if the
-- default ever changes, and a member who never chose should move with it.
--
-- The CHECK is a closed list rather than free text, because this value is used
-- to build a CSS class name. An unconstrained string reaching a class attribute
-- is how a stored value turns into a selector nobody wrote.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS holder_style TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_holder_style_known'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_holder_style_known
      CHECK (holder_style IS NULL OR holder_style IN
        ('cognac','black','saffiano','canvas','metal','minimal'));
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and 0001's owner-scoped
-- RLS already covers every column on this table.

COMMENT ON COLUMN public.user_profiles.holder_style IS
  'Which card holder the members cards are drawn in on the Credit page. One of cognac, black, saffiano, canvas, metal, minimal, enforced by CHECK because the value becomes part of a CSS class name and free text there is a selector nobody wrote. NULL means they have not chosen and get the default, which is different from choosing the default: if the default changes, an unchosen member moves with it and a chosen one does not. Stored per MEMBER rather than per device, unlike the theme, because a wallet that changed when you opened your laptop would be a bug.';

-- Expect: every existing row unchanged with holder_style NULL, because nobody
-- has chosen one yet.
SELECT count(*)                                        AS profiles,
       count(*) FILTER (WHERE holder_style IS NOT NULL) AS chosen
  FROM public.user_profiles;
