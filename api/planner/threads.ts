// /api/planner/threads, Ask Juniper's chat history (issue #263, migration
// 0054). Moves src/lib/planner.ts's threads off localStorage-only so a
// question asked from one device is still there on the next.
//
//   GET                    -> the caller's threads, newest first
//   POST   { id, ... }     -> create one (id is CLIENT-supplied; see below)
//   PATCH  ?id=<uuid>      -> update whichever fields are present
//   DELETE ?id=<uuid>      -> delete one
//
// WHY THE CLIENT SUPPLIES id RATHER THAN READING IT BACK. create() in
// planner.ts is synchronous today: a member presses a starter question and the
// thread exists, with a real id, before this endpoint has even been called.
// Server-backing that must not turn it into something a caller has to await
// just to learn its own id, so the client generates a UUID itself and this
// endpoint inserts it as given rather than defaulting one server-side.
//
// WHY messages IS TRUSTED AS OPAQUE JSON RATHER THAN VALIDATED TURN BY TURN.
// Every message already passed through the model or the member's own composer
// before it reached this endpoint; the only thing this endpoint owes the
// table is that a message array cannot grow without bound and cannot smuggle
// something other than the two fields the client (and the rail, and the
// reports it can generate) ever reads. So each message is narrowed to
// {role, content} and nothing else survives.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_PLAN_TITLE = 120;
const MAX_PLAN_CONTEXT = 2000;
const MAX_MESSAGES = 500;
const MAX_MSG_LEN = 8000;
const enc = encodeURIComponent;

type Msg = { role: "user" | "assistant"; content: string };

// Narrowed the same way asDashboardLayout narrows a stored layout: a
// constraint in a database the client cannot see is not something this
// endpoint should trust, so every message is rebuilt field by field rather
// than cast.
function parseMessages(v: unknown): Msg[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > MAX_MESSAGES) return null;
  const out: Msg[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const role = r.role;
    const content = r.content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content || content.length > MAX_MSG_LEN) return null;
    out.push({ role, content });
  }
  return out;
}

function clip(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

async function list(uid: string): Promise<Response> {
  const r = await adminRest(
    `chat_threads?user_id=eq.${uid}` +
      `&select=id,title,plan_context,plan_title,messages,report,created_at,updated_at` +
      `&order=updated_at.desc&limit=500`,
  );
  if (!r.ok) {
    console.error(`[planner/threads] read failed (${r.status})`);
    return json({ error: "Could not read your chats" }, 500);
  }
  return json({ items: await r.json() });
}

async function create(uid: string, body: unknown): Promise<Response> {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!UUID_RE.test(id)) return json({ error: "A valid id is required" }, 400);

  const row: Record<string, unknown> = {
    id, user_id: uid,
    title: clip(b.title, MAX_TITLE) ?? "New chat",
    plan_context: clip(b.planContext, MAX_PLAN_CONTEXT) ?? null,
    plan_title: clip(b.planTitle, MAX_PLAN_TITLE) ?? null,
  };
  if (b.messages !== undefined) {
    const messages = parseMessages(b.messages);
    if (!messages) return json({ error: "messages is malformed" }, 400);
    row.messages = messages;
  }

  const r = await adminRest("chat_threads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    console.error(`[planner/threads] create failed (${r.status}): ${await r.text().catch(() => "")}`);
    return json({ error: "Could not save that chat" }, 500);
  }
  const [saved] = (await r.json()) as unknown[];
  return json(saved ?? null, 201);
}

async function patch(uid: string, id: string, body: unknown): Promise<Response> {
  if (!UUID_RE.test(id)) return json({ error: "A valid id is required" }, 400);
  const b = (body ?? {}) as Record<string, unknown>;
  const row: Record<string, unknown> = {};

  if (b.title !== undefined) {
    const title = clip(b.title, MAX_TITLE);
    if (!title) return json({ error: "title is required" }, 400);
    row.title = title;
  }
  if (b.planContext !== undefined) row.plan_context = clip(b.planContext, MAX_PLAN_CONTEXT) ?? null;
  if (b.planTitle !== undefined) row.plan_title = clip(b.planTitle, MAX_PLAN_TITLE) ?? null;
  if (b.messages !== undefined) {
    const messages = parseMessages(b.messages);
    if (!messages) return json({ error: "messages is malformed" }, 400);
    row.messages = messages;
  }
  // A generated PlanReport is a whole structured document the client already
  // built (generateReport, api/planner/report.ts); this endpoint stores it
  // opaquely rather than re-validating its shape, the same trust boundary
  // `report` already crosses when the client renders it straight to a PDF.
  if (b.report !== undefined) row.report = b.report;

  if (!Object.keys(row).length) return json({ error: "Nothing to update" }, 400);

  const r = await adminRest(`chat_threads?user_id=eq.${uid}&id=eq.${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    console.error(`[planner/threads] update failed (${r.status})`);
    return json({ error: "Could not update that chat" }, 500);
  }
  return json({ ok: true });
}

async function remove(uid: string, id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return json({ error: "A valid id is required" }, 400);
  const r = await adminRest(`chat_threads?user_id=eq.${uid}&id=eq.${enc(id)}`, { method: "DELETE" });
  if (!r.ok) {
    console.error(`[planner/threads] delete failed (${r.status})`);
    return json({ error: "Could not delete that chat" }, 500);
  }
  return json({ ok: true });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";

  if (req.method === "GET") return list(uid);
  if (req.method === "POST") return create(uid, await req.json().catch(() => null));
  if (req.method === "PATCH") return patch(uid, id, await req.json().catch(() => null));
  if (req.method === "DELETE") return remove(uid, id);
  return json({ error: "Method not allowed" }, 405);
}
