// The AI financial planner, the "planner layer" that sees the user's real,
// server-verified finances and answers grounded questions. Unlike the older
// /api/chat (which trusted a client-supplied profile string), this endpoint
// fetches the snapshot itself, scoped to the JWT's uid, and hands it to the
// model through a tool. Streaming SSE, same wire shape the client already reads.
import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { fetchScoreInput } from "../_finance-snapshot";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = `You are Juniper, an AI financial planner. You help young individuals and families plan with clarity: budgeting, debt, buying a home, saving for a baby or education, building an emergency fund, investing basics, and life transitions.

You have a tool, get_finances, that returns the user's REAL linked-account picture (income, spending, cash, debt, investments, emergency-fund months). Call it whenever a question depends on their situation, affordability, "can I…", pacing a goal, or anything that should reflect their actual numbers. Never invent a balance; if you need a figure you don't have, call the tool or ask. If get_finances reports the user hasn't linked accounts yet, answer generally and invite them to link accounts for a tailored plan.

How you answer:
- Warm, direct, plain language. Explain any jargon right after you use it.
- Ground advice in the user's real numbers when you have them. Show the reasoning briefly so it's clear where a recommendation comes from.
- For a multi-goal question (e.g. saving for education while also buying a home), lay out the trade-off and a fundable pace for each, using their actual cash-flow.
- Keep it to a few short paragraphs. No bullet-point walls.

Compliance (always):
- You give educational guidance and are a thinking partner, not a licensed advisor, CPA, or attorney.
- For entity formation, tax elections, estate or legal documents, and state-specific legal questions, give the general shape, then say plainly to confirm with a licensed CPA or attorney before acting.
- Never push a specific product or account provider. Explain what to compare instead.

Writing rules (strict):
- Never use em-dashes (— or --). Use a comma, period, or rewrite.
- Never open a sentence with "honestly" or use "and honestly" as filler.
- Prefer short sentences.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_finances",
    description:
      "Return the signed-in user's real financial snapshot from their linked accounts: monthly income and spending, cash reserves, card and loan debt, investment balances, emergency-fund months, and annual income. Returns { linked:false } if the user has not linked accounts yet. Call this whenever an answer should reflect the user's actual situation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

type InMsg = { role: "user" | "assistant"; content: string };

async function runGetFinances(uid: string): Promise<string> {
  try {
    const snap = await fetchScoreInput(uid);
    if (!snap.linked) return JSON.stringify({ linked: false });
    const { input, signals } = snap;
    return JSON.stringify({
      linked: true,
      monthlyIncome: input.monthlyIncome,
      monthlySpending: input.monthlySpending,
      cashReserves: input.cashReserves,
      cardDebt: signals.cardDebt,
      loanDebt: signals.loanDebt,
      totalDebt: input.totalDebt,
      investmentBalance: input.investmentBalance,
      totalAssets: input.totalAssets,
      emergencyFundMonths: signals.emergencyMonths,
      annualIncome: signals.annualIncome,
    });
  } catch {
    return JSON.stringify({ linked: false, error: "snapshot_unavailable" });
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const supabaseUrl = readEnv("SUPABASE_URL");
  const legacySecret = readEnv("SUPABASE_JWT_SECRET");
  if (!apiKey || !supabaseUrl)
    return json({ error: "Server not configured" }, 500);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl, legacySecret });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

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
    ? SYSTEM +
      `\n\nThe user opened this chat from a specific plan. Stay grounded in it; if they drift far off-topic, answer briefly and steer back.\n--- Plan in focus ---\n${body.planContext}\n--- end ---`
    : SYSTEM;

  // Conversation grows as tool rounds append; content is string | blocks[].
  const convo: Anthropic.MessageParam[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        for (let round = 0; round < 4; round++) {
          const stream = client.messages.stream({
            model: "claude-opus-5",
            max_tokens: 2048,
            system,
            tools: TOOLS,
            messages: convo,
          });
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            )
              send({ text: event.delta.text });
          }
          const final = await stream.finalMessage();
          if (final.stop_reason !== "tool_use") break;

          // Resolve each tool call server-side, scoped to this uid.
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type === "tool_use") {
              const out =
                block.name === "get_finances"
                  ? await runGetFinances(uid)
                  : JSON.stringify({ error: "unknown_tool" });
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: out,
              });
            }
          }
          convo.push({ role: "assistant", content: final.content });
          convo.push({ role: "user", content: results });
        }
        send({ text: "" });
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...cors,
    },
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
