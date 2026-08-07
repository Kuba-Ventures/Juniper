// Turns an Ask Juniper conversation into a structured, saveable plan the client
// renders as a polished PDF. Uses forced tool-use so the model returns clean
// structured data (reliable on the pinned SDK) instead of free-form prose we'd
// have to parse. Same auth + model as the planner chat; single-shot, no stream.
import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = `You are Juniper, an AI financial planner. Turn the conversation into a finished, easy-to-follow written plan the user can save as a PDF and act on.

Write for a smart person who is not a finance expert. Ground the plan in the numbers and decisions already discussed in the conversation. Be concrete: real amounts, real timelines, a clear order of operations.

- title: a short, plain title for the plan (e.g. "Your education funding plan").
- headline: one sentence capturing the recommendation.
- situation: 2 to 4 sentences on where the user stands today, using their numbers.
- recommendation: the core recommendation in 2 to 4 sentences, with the reasoning.
- steps: 3 to 6 concrete, ordered actions. Each has a short title and a detail sentence; include a timeline and a dollar amount where it makes sense.
- assumptions: any figures or conditions the plan assumes, so the user can sanity-check them.

Style: warm, direct, plain language. Never use em-dashes (— or --); use a comma or a period. This is educational guidance, not licensed financial, tax, or legal advice.`;

const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_plan",
  description: "Emit the finished financial plan as structured data.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      headline: { type: "string" },
      situation: { type: "string" },
      recommendation: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            timeline: { type: "string" },
            amount: { type: "string" },
          },
          required: ["title", "detail"],
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
    },
    required: ["title", "headline", "situation", "recommendation", "steps"],
  },
};

type InMsg = { role: "user" | "assistant"; content: string };

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

  let body: { messages: InMsg[]; planContext?: string };
  try {
    body = (await req.json()) as { messages: InMsg[]; planContext?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return json({ error: "messages required" }, 400);

  const client = new Anthropic({ apiKey });
  const system = body.planContext
    ? SYSTEM + `\n\nThis plan is for the user's "${body.planContext}".`
    : SYSTEM;

  const messages: Anthropic.MessageParam[] = [
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: "Turn our conversation into a finished plan I can save as a PDF." },
  ];

  try {
    const msg = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      system,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "emit_plan" },
      messages,
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return json({ error: "No plan generated" }, 502);
    return json(block.input, 200);
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
