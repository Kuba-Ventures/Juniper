// Turns an Ask Juniper conversation into a draft for a real, trackable Plan
// row (target, current, monthly, shape), never a narrative report. Distinct
// from report.ts, which writes a PDF nobody can check a box against.
//
// The one rule this whole endpoint exists to enforce: a figure only appears
// in the draft if the conversation actually established it. Forced tool-use
// with a `found` list, rather than trusting the model to simply omit a field
// it is unsure of, because a model asked for "the target amount" will
// otherwise happily estimate one from context. `found` is what lets the
// client mark a number as "from your conversation" instead of quietly
// treating a guess as a fact, and what lets it show an honest empty state
// when the conversation never got concrete.
import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = `You are Juniper, an AI financial planner. Read the conversation and extract a draft for a trackable plan: a target, what the member already has, a monthly amount, and a shape.

The four shapes:
- save: saving toward a target (a wedding, a trip, an emergency fund, a car paid in cash).
- buy: a purchase with a down payment (a home, a car financed with one).
- payoff: paying down an existing balance (a loan, a credit card). "current" is what has been paid off so far, "target" is the original balance, and a "rate" is the balance's annual interest rate as a percentage.
- income: growing what the member earns (a raise, a new job, a side hustle). "current" and "target" are income figures, not savings; never set monthly or rate for this shape.

Extract ONLY figures the conversation actually established, whether stated by the member or computed by Juniper from the member's real linked data already referenced earlier in the conversation. Do not estimate, round to a "reasonable" number, or fill a gap with a plausible guess: if the conversation never named a monthly amount, leave it out and do not list it in "found". List a field in "found" only when you are confident it came from the conversation, not from your own arithmetic on unstated assumptions. It is correct and expected for "found" to be short, or even empty, when the conversation stayed general.

"name" is a short plan name a member would recognize, drawn from what the conversation was about (e.g. "Wedding", "Down payment on a house"), never a generic label like "New plan".`;

const DRAFT_TOOL: Anthropic.Tool = {
  name: "emit_plan_draft",
  description: "Emit a draft for a trackable plan, extracted from the conversation.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      shape: { type: "string", enum: ["save", "buy", "payoff", "income"] },
      target_value: { type: "number", description: "Target amount, or target income for an income plan." },
      current_value: { type: "number", description: "Saved/paid off so far, or current income for an income plan." },
      monthly_contribution: { type: "number", description: "Monthly amount toward the target. Never set for an income plan." },
      rate: { type: "number", description: "Annual interest rate as a percentage. Payoff plans only." },
      target_date: { type: "string", description: "A target date as stated, e.g. \"Dec 2027\"." },
      found: {
        type: "array",
        items: { type: "string", enum: ["target_value", "current_value", "monthly_contribution", "rate", "target_date"] },
        description: "Which of the numeric/date fields above were actually established in the conversation.",
      },
    },
    required: ["name", "shape", "found"],
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
    ? SYSTEM + `\n\nThis conversation is scoped to the member's "${body.planContext}".`
    : SYSTEM;

  const messages: Anthropic.MessageParam[] = [
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: "Draft a plan from what we've discussed." },
  ];

  try {
    const msg = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system,
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "emit_plan_draft" },
      messages,
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use")
      return json({ error: "No draft generated" }, 502);
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
