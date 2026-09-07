-- Which widgets a member wants on the SHARED Overview, and in what order.
-- Issue #290's open decision, now answered: a member may arrange the shared
-- page, but only for themselves. Two people looking at the same shared page
-- can therefore see two different arrangements of it, the same way two people
-- looking at the same Netflix "Continue Watching" row see two different rows:
-- the content is shared, the arrangement is not.
--
-- ---- WHY A SEPARATE COLUMN AND NOT dashboard_layout REUSED ---------------
--
-- dashboard_layout (0049) and this column hold ids from two different
-- registries (personal Overview widgets vs shared Overview widgets), which
-- happen to overlap in NO ids today and are not guaranteed to stay that way.
-- One column holding both would mean a personal widget and a shared widget
-- could collide on an id, or worse, a client bug could apply a shared order
-- to the personal page. Two columns make that class of bug impossible rather
-- than merely unlikely, at the cost of one more nullable column on a row
-- that already carries several.
--
-- ---- WHY PER-PROFILE ROW AND NOT PER-PARTNERSHIP --------------------------
--
-- This rides on user_profiles, exactly like dashboard_layout, rather than on
-- any partnership or shared-workspace table: it is the same design already
-- used for holder_style (0048) and dashboard_layout (0049), a preference that
-- belongs to the person rather than to the space they are looking at. A
-- partnership ending and a new one starting later does not carry an old
-- arrangement forward, since the person's row is what is arranged, not any
-- particular partnership's.
--
-- Same hidden-set-not-visible-list shape as 0049, same reasons: an id absent
-- from both `order` and `hidden` resolves against the shared widget registry,
-- so a widget added to the shared page later reaches every existing member's
-- shelf instead of being silently switched off. Same un-closed id list, for
-- the same reason: the ids are a registry that grows.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS shared_dashboard_layout JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_shared_dashboard_layout_shape'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_shared_dashboard_layout_shape
      CHECK (
        shared_dashboard_layout IS NULL OR (
          jsonb_typeof(shared_dashboard_layout) = 'object'
          -- COALESCE on every one of these: `->` on an absent key returns SQL
          -- NULL, jsonb_typeof(NULL) is NULL, and a CHECK whose expression is
          -- NULL passes. 0049 caught this the hard way, on a scratch Postgres
          -- rather than in production; carried forward here from the start.
          AND COALESCE(jsonb_typeof(shared_dashboard_layout -> 'v'), 'absent') = 'number'
          AND COALESCE(jsonb_typeof(shared_dashboard_layout -> 'order'), 'absent') = 'array'
          AND COALESCE(jsonb_typeof(shared_dashboard_layout -> 'hidden'), 'absent') = 'array'
          AND jsonb_array_length(shared_dashboard_layout -> 'order') <= 64
          AND jsonb_array_length(shared_dashboard_layout -> 'hidden') <= 64
          AND NOT jsonb_path_exists(shared_dashboard_layout, '$.order[*] ? (@.type() != "string")')
          AND NOT jsonb_path_exists(shared_dashboard_layout, '$.hidden[*] ? (@.type() != "string")')
        )
      );
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and 0001's
-- owner-scoped RLS already covers every column on this table.

COMMENT ON COLUMN public.user_profiles.shared_dashboard_layout IS
  'How THIS member (not the partnership) arranged the shared Overview: {"v":1,"order":["together",...],"hidden":["goals"]}. Separate from dashboard_layout (0049), which is the personal Overview''s own arrangement and a distinct widget registry. Same shape and same rules as 0049: stores the order and the hidden set, never the visible list, so a shared widget added later reaches every existing member''s shelf instead of being silently switched off; ids are deliberately not constrained to a closed list, since they are the shared-page widget registry. NULL means this member has not arranged the shared page and gets the default order.';

-- Expect: every existing row unchanged with shared_dashboard_layout NULL,
-- because this column did not exist until this migration.
SELECT count(*)                                                   AS profiles,
       count(*) FILTER (WHERE shared_dashboard_layout IS NOT NULL) AS arranged
  FROM public.user_profiles;
