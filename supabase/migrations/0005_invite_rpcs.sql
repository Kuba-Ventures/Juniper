-- Stage 4 followup: accept + lookup invite via SECURITY DEFINER functions.
-- The previous PATCH-based accept was rejected by RLS because the partner
-- accepting an invite is neither user_id nor partner_user_id on the row yet.
-- These functions run as the schema owner and bypass RLS.

-- Clean up the broad SELECT-by-invite-token policy from 0004 — it allowed
-- any authenticated user to SELECT any plan that had an invite_token, which
-- is more permissive than we want. Lookup now goes through the RPC.
DROP POLICY IF EXISTS plans_select_by_invite_token ON public.plans;

-- ── lookup_plan_invite: returns minimal display info for the landing page ─
CREATE OR REPLACE FUNCTION public.lookup_plan_invite(p_token TEXT)
RETURNS TABLE (
  domain TEXT,
  inviter_first_name TEXT,
  goal_headline TEXT,
  already_accepted BOOLEAN,
  partner_is_self BOOLEAN,
  inviter_is_self BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT p.domain,
         COALESCE(split_part(up.name, ' ', 1), 'Your partner') AS inviter_first_name,
         (p.goal->>'headline') AS goal_headline,
         (p.partner_user_id IS NOT NULL) AS already_accepted,
         (p.partner_user_id = v_user_id) AS partner_is_self,
         (p.user_id = v_user_id) AS inviter_is_self
    FROM public.plans p
    LEFT JOIN public.user_profiles up ON up.user_id = p.user_id
    WHERE p.invite_token = p_token
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_plan_invite(TEXT) TO authenticated;

-- ── accept_plan_invite: attaches the caller as partner_user_id ────────────
CREATE OR REPLACE FUNCTION public.accept_plan_invite(p_token TEXT)
RETURNS TABLE (
  ok BOOLEAN,
  domain TEXT,
  already_accepted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_owner_id UUID;
  v_existing_partner UUID;
  v_domain TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT plans.id, plans.user_id, plans.partner_user_id, plans.domain
    INTO v_plan_id, v_owner_id, v_existing_partner, v_domain
    FROM public.plans
    WHERE invite_token = p_token
    LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_owner_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot accept your own invite';
  END IF;

  IF v_existing_partner IS NOT NULL AND v_existing_partner <> v_user_id THEN
    RAISE EXCEPTION 'Invite already accepted by another user';
  END IF;

  IF v_existing_partner = v_user_id THEN
    RETURN QUERY SELECT TRUE, v_domain, TRUE;
    RETURN;
  END IF;

  UPDATE public.plans
  SET partner_user_id = v_user_id,
      partner_invite_status = 'accepted',
      partner_dialogue_status = 'not_started',
      updated_at = NOW()
  WHERE id = v_plan_id;

  RETURN QUERY SELECT TRUE, v_domain, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_plan_invite(TEXT) TO authenticated;
