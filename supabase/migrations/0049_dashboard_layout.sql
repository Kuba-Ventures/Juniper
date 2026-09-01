-- Which widgets the member wants on their Overview, and in what order.
--
-- ---- WHY THE HIDDEN SET AND NOT THE VISIBLE LIST -------------------------
--
-- The obvious shape is "the list of widgets to draw". It is wrong, and it is
-- wrong in the direction that fails silently a month from now: a widget added
-- to the app after a member last arranged their Overview is absent from their
-- stored list, so a visible list would switch every new widget OFF for every
-- existing member, with nothing on screen to say a new card exists at all. The
-- people it would hide it from are exactly the ones who have used the product
-- long enough to have arranged it.
--
-- So the stored value is the NEGATIVE: an order, and the set of widgets the
-- member has turned off. A widget in neither is new, and new means visible.
--
-- ---- WHY ONE JSONB COLUMN AND NOT A ROW PER WIDGET -----------------------
--
-- A row per widget would make the order a column to maintain (renumber on every
-- drag) and would let a layout be half-written. This value is read and written
-- whole, always, by one member, on one screen: it is a document, and the
-- profile row it belongs to is already fetched on every app load. It rides
-- beside holder_style (0048) for the same reason that column exists: this is a
-- thing the member arranged, so it travels with them rather than with the
-- device, unlike the theme, which is a property of the screen.
--
-- ---- WHY THE CHECK CONSTRAINS THE SHAPE AND NOT THE IDS ------------------
--
-- 0048 constrains holder_style to a closed list, because that value becomes
-- part of a CSS class name. This one must not: the ids ARE the widget registry,
-- which grows whenever a card is added, and a closed list here would mean a
-- migration before every new widget and a member's layout refused by the
-- database the moment the app shipped one. The client already drops an id it
-- does not know and appends one it has never seen, which is the reconciliation
-- the hidden-set shape exists for.
--
-- What IS constrained is the shape, because this is the one column whose
-- contents are written by a client rather than derived server-side: an object,
-- two arrays of strings, a version, and a length ceiling so a stored layout
-- cannot grow without bound. Anything else is refused here rather than
-- discovered by the renderer.
--
-- ---- WHY NULL IS A REAL VALUE --------------------------------------------
--
-- NULL means "has not arranged anything", which is every row that exists today,
-- and it renders the default order. It is NOT the same as saving the default
-- explicitly: a member who has never touched this moves with the default if it
-- ever changes, and one who arranged their Overview keeps what they arranged.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_dashboard_layout_shape'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_dashboard_layout_shape
      CHECK (
        dashboard_layout IS NULL OR (
          jsonb_typeof(dashboard_layout) = 'object'
          -- COALESCE on every one of these, because `->` on a key that is not
          -- there returns SQL NULL, jsonb_typeof(NULL) is NULL, and a CHECK
          -- whose expression is NULL PASSES. Without it a layout missing
          -- `order` entirely is accepted by a constraint written to require it,
          -- which is the failure this shape check exists to prevent. Caught on
          -- a scratch Postgres, not by reading it.
          AND COALESCE(jsonb_typeof(dashboard_layout -> 'v'), 'absent') = 'number'
          AND COALESCE(jsonb_typeof(dashboard_layout -> 'order'), 'absent') = 'array'
          AND COALESCE(jsonb_typeof(dashboard_layout -> 'hidden'), 'absent') = 'array'
          AND jsonb_array_length(dashboard_layout -> 'order') <= 64
          AND jsonb_array_length(dashboard_layout -> 'hidden') <= 64
          -- Every element a string, checked with jsonpath because a CHECK
          -- cannot hold a subquery and jsonb_path_exists is immutable.
          AND NOT jsonb_path_exists(dashboard_layout, '$.order[*] ? (@.type() != "string")')
          AND NOT jsonb_path_exists(dashboard_layout, '$.hidden[*] ? (@.type() != "string")')
        )
      );
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and 0001's
-- owner-scoped RLS already covers every column on this table.

COMMENT ON COLUMN public.user_profiles.dashboard_layout IS
  'How the member arranged their Overview: {"v":1,"order":["score",...],"hidden":["budgets"]}. Stores the ORDER and the HIDDEN SET, never the visible list, because a widget added to the app later is absent from every stored layout and a visible list would therefore switch it off for every existing member with nothing on screen to say it exists. Widget ids are deliberately NOT constrained to a closed list, unlike holder_style in 0048: the ids are the app''s widget registry and a closed list would mean a migration before every new card. The CHECK constrains the shape only, since this is the one column on this table written by a client. NULL means they have not arranged anything and get the default order, which is different from saving the default: an unarranged member moves if the default changes, an arranged one does not.';

-- Expect: every existing row unchanged with dashboard_layout NULL, because
-- nobody has arranged their Overview yet.
SELECT count(*)                                            AS profiles,
       count(*) FILTER (WHERE dashboard_layout IS NOT NULL) AS arranged
  FROM public.user_profiles;
