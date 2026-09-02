-- A widget's chosen SIZE, alongside the order and the hidden set 0049 already
-- stores. Issue #259: a widget can declare more than one size it honestly
-- draws at (the Score is a ring at half width and the same factor rails from
-- /app/score at full width), and this is where that choice is stored.
--
-- ---- WHY THIS IS AN ADDITIVE CHANGE TO THE SAME COLUMN, NOT A NEW ONE -----
--
-- 0049's own header already answered "why one JSONB column and not a row per
-- widget": this is a document, read and written whole, by one member, on one
-- screen. A size choice is the same kind of fact as an order or a hidden flag,
-- so it belongs in the same document rather than in a second column that a
-- reader would have to remember to fetch alongside the first.
--
-- ---- WHY `sizes` IS OPTIONAL AND `v` STAYS 1 -------------------------------
--
-- 0049's `v` exists so a later change of MEANING can be told from a guess at
-- the keys present. Adding `sizes` does not change what `order` or `hidden`
-- mean, so this is not that later change: a layout saved before this migration
-- simply has no `sizes` key, which reads back as "every widget at its own
-- default size", exactly the no-op the 0049 header describes for `hidden`.
--
-- ---- WHY THE KEYS (WIDGET IDS) ARE UNCONSTRAINED, LIKE 0049's ARRAYS ------
--
-- Same reasoning as `order` and `hidden`: the ids are the app's widget
-- registry, which grows whenever a card is added, and a closed list here would
-- mean a migration before every new widget. The client already drops a key it
-- does not recognize (`asDashboardLayout`) and a size a widget no longer
-- declares resolves to that widget's default (`sizeFor`), the same
-- reconciliation 0049 built for `order` and `hidden`.
--
-- ---- WHY THE VALUES ARE CHECKED FOR TYPE BUT NOT FOR A CLOSED SET ---------
--
-- `holder_style` (0048) closes its value list because that string becomes part
-- of a CSS class name. A widget's size is read through `sizeFor`, which only
-- ever honors a value the WIDGET ITSELF currently declares, so a stray string
-- here can widen nothing: it either matches a real size or falls back to the
-- default, in application code, the same trust boundary 0049 draws around
-- widget ids. The database still refuses anything that is not a string, so a
-- malformed write is caught here rather than discovered by the renderer.
--
-- ---- WHY A TEXT-LENGTH CEILING AND NOT A KEY COUNT ------------------------
--
-- 0049 counts array elements with `jsonb_array_length`, which has no object
-- equivalent, and a CHECK constraint cannot hold a subquery (0049's own header
-- says why `jsonb_path_exists` is used instead of one). Capping the
-- serialized text of `sizes` is the same bound in spirit, cannot grow without
-- one, without a subquery: 2000 characters is far more than 64 widgets, each
-- with a short id and a short size string, could ever need.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_dashboard_layout_shape'
  ) THEN
    ALTER TABLE public.user_profiles
      DROP CONSTRAINT user_profiles_dashboard_layout_shape;
  END IF;

  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_dashboard_layout_shape
    CHECK (
      dashboard_layout IS NULL OR (
        jsonb_typeof(dashboard_layout) = 'object'
        AND COALESCE(jsonb_typeof(dashboard_layout -> 'v'), 'absent') = 'number'
        AND COALESCE(jsonb_typeof(dashboard_layout -> 'order'), 'absent') = 'array'
        AND COALESCE(jsonb_typeof(dashboard_layout -> 'hidden'), 'absent') = 'array'
        AND jsonb_array_length(dashboard_layout -> 'order') <= 64
        AND jsonb_array_length(dashboard_layout -> 'hidden') <= 64
        AND NOT jsonb_path_exists(dashboard_layout, '$.order[*] ? (@.type() != "string")')
        AND NOT jsonb_path_exists(dashboard_layout, '$.hidden[*] ? (@.type() != "string")')
        -- `sizes` is new and optional: absent passes, same as every existing
        -- row saved before this migration. Present, it must be an object of
        -- string values under a serialized-size ceiling.
        AND COALESCE(jsonb_typeof(dashboard_layout -> 'sizes'), 'object') = 'object'
        AND length((COALESCE(dashboard_layout -> 'sizes', '{}'::jsonb))::text) <= 2000
        AND NOT jsonb_path_exists(dashboard_layout, '$.sizes.* ? (@.type() != "string")')
      )
    );
END $$;

COMMENT ON COLUMN public.user_profiles.dashboard_layout IS
  'How the member arranged their Overview: {"v":1,"order":["score",...],"hidden":["budgets"],"sizes":{"score":"full"}}. Stores the ORDER and the HIDDEN SET, never the visible list, because a widget added to the app later is absent from every stored layout and a visible list would therefore switch it off for every existing member with nothing on screen to say it exists. `sizes` (0050) holds only the widgets whose chosen size differs from their own default, for the same reason. Widget ids are deliberately NOT constrained to a closed list, unlike holder_style in 0048: the ids are the app''s widget registry and a closed list would mean a migration before every new card. Same reasoning covers a size value: the database checks it is a string and nothing more, because sizeFor() only ever honors a value the widget itself still declares. The CHECK constrains the shape only, since this is the one column on this table written by a client. NULL means they have not arranged anything and get the default order and every widget at its default size, which is different from saving the default: an unarranged member moves if the default changes, an arranged one does not.';

-- Expect: every existing row unchanged, since this only widens the CHECK to
-- also accept a `sizes` key nothing has written yet.
SELECT count(*)                                            AS profiles,
       count(*) FILTER (WHERE dashboard_layout IS NOT NULL) AS arranged,
       count(*) FILTER (WHERE dashboard_layout ? 'sizes')   AS with_sizes
  FROM public.user_profiles;
