-- Household roles: replace the age-framed adult/teen split with a capability
-- one (issue #333). Reading api/household.ts end to end turned up that
-- "adult" and "teen" were already functionally identical: no endpoint, and no
-- RLS policy (both tables are server-only with a restrictive deny), ever
-- checked role for anything but "owner or not". set-account-share and
-- share-plan gate only on the caller owning the account/plan being shared, so
-- the invite modal's "teen: can view and share, can't invite or remove
-- anyone" was describing a restriction equally true of "adult" -- only the
-- owner could ever invite or remove. The role existed and did nothing.
--
-- `viewer` is the first role that actually withholds a capability: it cannot
-- call set-account-share or share-plan at all (enforced in api/household.ts
-- in the same change as this migration), a genuine read-only tier that did
-- not exist before. `member` is what "adult" and "teen" already were: can
-- share and unshare their own accounts and plans, cannot invite, remove, or
-- change anyone's role -- that stays owner-only, unchanged.
--
-- Existing rows migrate to `member`, never `viewer`: both `adult` and `teen`
-- already had full sharing rights, and a naming cleanup must not silently
-- strip a capability nobody chose to give up. An owner assigns `viewer`
-- going forward the same way they change any other role (edit-role, or by
-- inviting someone directly as one).

-- Constraints drop BEFORE the data migrates, not after: the old CHECK still
-- names only owner/adult/teen, and rewriting existing rows to 'member' first
-- would violate it before this statement ever gets to replace it (caught by
-- running this migration against a scratch Postgres seeded with an 'adult'
-- and a 'teen' row, per the project's own migration-verification convention).
ALTER TABLE public.household_members DROP CONSTRAINT IF EXISTS household_members_role_check;
ALTER TABLE public.household_invites DROP CONSTRAINT IF EXISTS household_invites_role_check;

UPDATE public.household_members SET role = 'member' WHERE role IN ('adult', 'teen');
UPDATE public.household_invites SET invited_role = 'member' WHERE invited_role IN ('adult', 'teen');

ALTER TABLE public.household_members
  ADD CONSTRAINT household_members_role_check CHECK (role IN ('owner', 'member', 'viewer'));
ALTER TABLE public.household_members ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE public.household_invites
  ADD CONSTRAINT household_invites_role_check CHECK (invited_role IN ('member', 'viewer'));
ALTER TABLE public.household_invites ALTER COLUMN invited_role SET DEFAULT 'member';

-- Expect (run by hand after applying): no row anywhere still says adult or
-- teen, and the CHECK refuses them going forward.
--   SELECT role, count(*) FROM public.household_members GROUP BY role;
--     -- owner and member only (viewer only once someone is actually set to it)
--   SELECT invited_role, count(*) FROM public.household_invites GROUP BY invited_role;
--     -- member only (viewer only once someone actually invites one)
--   INSERT INTO public.household_members (household_id, user_id, role)
--     VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'teen');
--     -- rejected: violates household_members_role_check
