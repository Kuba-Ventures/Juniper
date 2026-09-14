// A short, real summary for a thread's sidebar label (issue #421), replacing
// what `titleFrom()` in src/lib/planner.ts is stuck doing on its own: a pure
// client-side truncation of the member's first message. A real question like
// "How much a month can I reasonably put toward rent without wrecking my
// other goals?" truncates to "How much a month can I reaso…", cut off
// mid-word, with no way to tell threads apart without opening each one.
//
// Called ONCE per thread, from planner.ts's runTurn after the first
// assistant reply lands, so it costs one small model call per thread rather
// than per message, the same "run once, cache on the thread" shape `title`
// already has. titleFrom() stays as the INSTANT fallback shown the moment a
// thread is created (this call has real latency, and the rail should never
// show "New chat" as its resting state while waiting on it) and as what the
// client falls back to on any failure here.
//
// Deliberately Haiku, not the claude-opus-5 every other planner endpoint
// uses. This is a two-to-four-word label, not a financial answer, and Haiku
// has no extended-thinking budget to silently burn the way claude-opus-5
// does (see PROJECT.md's `claude-opus-5` extended-thinking finding, which
// has no bearing here since this call never enables thinking and the model
// itself doesn't default to it).
//
// Forced tool-use for the same reason extract-plan.ts uses it: a free-text
// reply would need trimming and quote-stripping on every call regardless, so
// a schema that enforces the shape up front is simpler than validating a
// sentence back down into a label.
import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = `You label chat threads in a financial planning app's sidebar. Given the member's first question and Juniper's first reply, write a short label a member would recognize at a glance in a list of many threads.

Rules: 2 to 4 words. Title Case. No trailing punctuation. No quotation marks. Never a generic label like "Question" or "Financial advice" or "Chat". Name the SUBJECT of the question (e.g. "Rent affordability", not "How much rent" or the answer's conclusion).`;

const TITLE_TOOL: Anthropic.Tool = {
  name: "emit_thread_title",
  description: "Emit a short sidebar label for this chat thread.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "2-4 words, Title Case, no trailing punctuation, no quotes.",
      },
    },
    required: ["title"],
  },
};

// Bounds what reaches the model, not for correctness (Anthropic would just
// truncate context anyway) but so one long reply doesn't turn a "one small
// call" feature into a large one.
const MAX_INPUT = 1200;
const clip = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, MAX_INPUT);

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const supabaseUrl = readEnv("SUPABASE_URL");
  const legacySecret = readEnv("SUPABASE_JWT_SECRET");
  if (!apiKey || !supabaseUrl) return json({ error: "Server not configured" }, 500);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl, legacySecret });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  let body: { question?: unknown; answer?: unknown; planContext?: unknown };
  try {
    body = (await req.json()) as { question?: unknown; answer?: unknown; planContext?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const question = typeof body.question === "string" ? clip(body.question) : "";
  if (!question) return json({ error: "question required" }, 400);
  const answer = typeof body.answer === "string" ? clip(body.answer) : "";
  const planContext = typeof body.planContext === "string" ? clip(body.planContext) : "";

  const client = new Anthropic({ apiKey });
  const system = planContext ? `${SYSTEM}\n\n${planContext}` : SYSTEM;
  const userTurn = answer
    ? `Member's question:\n${question}\n\nJuniper's reply:\n${answer}`
    : `Member's question:\n${question}`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 40,
      system,
      tools: [TITLE_TOOL],
      tool_choice: { type: "tool", name: "emit_thread_title" },
      messages: [{ role: "user", content: userTurn }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return json({ error: "No title generated" }, 502);
    const input = block.input as { title?: unknown };
    const title = typeof input.title === "string" ? input.title.trim().replace(/^["'“”]+|["'“”]+$/g, "") : "";
    if (!title) return json({ error: "No title generated" }, 502);
    return json({ title: title.slice(0, 60) }, 200);
  } catch (err) {
    return json({ error: String(err) }, 502);
  }
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
