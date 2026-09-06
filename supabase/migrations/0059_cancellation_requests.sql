-- A member's request to cancel a confirmed recurring stream, processed by a
-- human (Finley today, a concierge hire later) rather than any partner API,
-- because there is no partner API to integrate against yet. ROADMAP.md Stage 9
-- names this reality directly: "one-click cancel everywhere" is not a single
-- API, incumbents put a human behind the button, and the scoped version here
-- is "request cancellation with my approval, backend flow chosen per
-- merchant." Modeled on the one moderation queue this repo already has
-- (partner_submissions, migration 0010): same status/notes/reviewed-at shape,
-- same ADMIN_EMAILS-gated processing endpoint.
--
-- ---- WHY THIS ROW IS THE AUDIT LOG, NOT A SEPARATE EVENTS TABLE -----------
--
-- Same precedent as partner_submissions: one row per request, its own
-- status/admin_notes/resolved_at/resolved_by fields ARE the record of who
-- decided what and when, rather than a second table logging every transition.
--
-- ---- WHY monthly_at_request and stream_name ARE SNAPSHOTS -----------------
--
-- A stream can be renamed (recurring_overrides.name) or its resolved monthly
-- figure can change between the moment a member asks and the moment an admin
-- processes the request, so both are captured at request time: what the
-- member saw when they clicked Cancel is what the admin queue and the later
-- "estimated savings" figure should describe, not whatever the stream reads
-- today.
--
-- ---- WHY THE PARTIAL UNIQUE INDEX ------------------------------------------
--
-- One OPEN request per stream at a time (requested or contacted), so a member
-- cannot queue the same cancellation twice while it is pending; a request
-- that ended in confirmed or failed can be superseded by a fresh one (a
-- failed attempt is exactly the case where trying again is the point).
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id           TEXT NOT NULL,
  stream_name         TEXT NOT NULL,
  monthly_at_request  NUMERIC,
  member_note         TEXT,
  status              TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'contacted', 'confirmed', 'failed')),
  admin_notes         TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_requests_one_open_per_stream
  ON public.cancellation_requests (user_id, stream_id)
  WHERE status IN ('requested', 'contacted');
CREATE INDEX IF NOT EXISTS cancellation_requests_user_id_idx ON public.cancellation_requests (user_id);
CREATE INDEX IF NOT EXISTS cancellation_requests_status_idx ON public.cancellation_requests (status);

-- The member can read and create their own requests (api/cancellation-requests.ts
-- runs as the caller's JWT for the ownership check, then writes with the
-- service-role key same as every other table here); processing a request
-- (status/admin_notes/resolved_*) is service-role only, via the ADMIN_EMAILS-
-- gated api/admin/cancellation-requests.ts, same split as partner_submissions.
GRANT SELECT, INSERT ON public.cancellation_requests TO authenticated;

ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cancellation_requests_select_own ON public.cancellation_requests;
CREATE POLICY cancellation_requests_select_own ON public.cancellation_requests
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cancellation_requests_insert_own ON public.cancellation_requests;
CREATE POLICY cancellation_requests_insert_own ON public.cancellation_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.cancellation_requests IS
  'A member''s request to cancel a confirmed recurring stream, processed by a human (ADMIN_EMAILS) rather than a partner API, which does not exist yet. One row per request is the audit log: status, admin_notes, resolved_at, resolved_by. monthly_at_request and stream_name are snapshots at request time. A partial unique index allows only one open (requested/contacted) request per stream at once.';
