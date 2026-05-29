import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { getScript, type DialogueContext } from "./_dialogue-scripts";
import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

type ApiMessage = { role: "user" | "assistant"; content: string };

type RequestBody = {
  domain: string;
  step_index: number;
  messages: ApiMessage[];
  context: DialogueContext;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const supabaseUrl = readEnv("SUPABASE_URL");
  const legacySecret = readEnv("SUPABASE_JWT_SECRET");
  if (!apiKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const token = extractBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifySupabaseJwt(token, { supabaseUrl, legacySecret });
  if (!payload?.sub) return unauthorized();

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const script = getScript(body.domain);
  if (!script) {
    return new Response(JSON.stringify({ error: `Unknown domain: ${body.domain}` }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const step = script.steps[body.step_index];
  if (!step) {
    return new Response(
      JSON.stringify({ error: `Invalid step_index ${body.step_index} for ${body.domain}` }),
      { status: 400, headers: { "Content-Type": "application/json", ...cors } },
    );
  }

  const systemPrompt = step.buildSystemPrompt(body.context ?? { collected: {} });
  const client = new Anthropic({ apiKey });

  // The synthesis step emits a large structured JSON; give it more headroom.
  const isSynthesisStep = body.step_index === script.steps.length - 1;
  const maxTokens = isSynthesisStep ? 4000 : 2000;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: body.messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = JSON.stringify({ text: event.delta.text });
            controller.enqueue(enc.encode(`data: ${chunk}\n\n`));
          }
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        const errChunk = JSON.stringify({ error: String(err) });
        controller.enqueue(enc.encode(`data: ${errChunk}\n\n`));
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
