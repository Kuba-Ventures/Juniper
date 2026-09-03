-- Ask Juniper's chat history, moved off localStorage-only so it follows the
-- member across devices (issue #263, option C: "openable from anywhere" only
-- makes sense once history isn't stranded on whichever device asked). Every
-- column here mirrors the client `Thread` shape in src/lib/planner.ts exactly,
-- 1:1, so the read path is a straight passthrough with no reshaping. Idempotent,
-- safe to re-run.
--
-- ---- WHY THE CLIENT SUPPLIES id RATHER THAN LETTING THE DEFAULT FIRE --------
--
-- create() in planner.ts has always been synchronous: a member presses a
-- starter question and the thread exists, with a real id, before any network
-- round trip returns. Server-backing this must not turn create() into
-- something a caller has to await just to learn the id it just made. So the
-- client generates the id itself (crypto.randomUUID()) and sends it as part of
-- the insert; the DEFAULT below is a safety net for a row written any other
-- way (a script, the SQL editor), never the path the app itself takes.
--
-- ---- WHY messages AND report ARE JSONB RATHER THAN NORMALIZED TABLES --------
--
-- A message is `{role, content}` with no fields of its own worth querying by
-- (no read state, no per-message id, nothing the app filters on independently
-- of its thread), and a report is a whole structured document the client
-- already builds and renders as one object. Splitting either into its own
-- table would buy joins for a shape nothing here ever queries piecemeal, the
-- same call `plans.dialogue_history` and `plans.milestones` already made.
--
-- ---- WHY THERE IS NO SEPARATE "last-read" OR SYNC-CONFLICT MACHINERY --------
--
-- There is exactly one writer for a given thread at a time in practice (a
-- member is rarely composing the same chat on two devices in the same
-- second), and every write here replaces the fields it touches wholesale
-- rather than patching a diff, so the last write for a given field simply
-- wins. That is the same posture recurring_streams' cache takes: correct for
-- the overwhelmingly common case, and a genuinely concurrent edit is not
-- silently corrupted, just not merged, which is an acceptable cost nothing
-- about this feature promises to solve.
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'New chat',
  -- Free text the assistant is grounded in: "Plan: Home Buying" from a plan's
  -- "Ask about this", or "Page: Credit" from the app-bar panel (#263). Nullable
  -- because a chat started from the standalone /app/ask welcome screen has none.
  plan_context TEXT,
  -- The short label the thread rail and the app-bar panel print beside the
  -- title ("Home Buying", "Credit"). Independent of plan_context, which is the
  -- prose sent to the model: this is what a person reads.
  plan_title   TEXT,
  -- Msg[] from src/lib/planner.ts: [{role: "user"|"assistant", content: string}, ...].
  messages     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The last saved PDF plan (PlanReport), if this thread ever generated one.
  -- Null means it never has, same convention as plans.goal before a target is set.
  report       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_threads_title_not_blank CHECK (length(btrim(title)) > 0)
);

-- The rail and the app-bar panel both list a member's threads newest first.
CREATE INDEX IF NOT EXISTS chat_threads_user_updated_idx
  ON public.chat_threads (user_id, updated_at DESC);

-- ── Grants ────────────────────────────────────────────────────────────────
-- Tables created via raw SQL don't auto-grant Data API access; without this
-- every request 401s regardless of the RLS policies below.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_threads_select_own ON public.chat_threads;
CREATE POLICY chat_threads_select_own ON public.chat_threads
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_threads_insert_own ON public.chat_threads;
CREATE POLICY chat_threads_insert_own ON public.chat_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_threads_update_own ON public.chat_threads;
CREATE POLICY chat_threads_update_own ON public.chat_threads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_threads_delete_own ON public.chat_threads;
CREATE POLICY chat_threads_delete_own ON public.chat_threads
  FOR DELETE USING (auth.uid() = user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────
-- Every read in the app sorts by this column, so a write path that forgets to
-- set it should not exist rather than merely being disciplined about it.
CREATE OR REPLACE FUNCTION public.touch_chat_threads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_threads_touch_updated_at ON public.chat_threads;
CREATE TRIGGER chat_threads_touch_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_threads_updated_at();

COMMENT ON TABLE public.chat_threads IS
  'Ask Juniper''s chat history (issue #263), server-backed so it follows a member across devices instead of living only in one browser''s localStorage. Columns mirror the client Thread shape 1:1 (src/lib/planner.ts); id is supplied by the client so create() stays synchronous.';
