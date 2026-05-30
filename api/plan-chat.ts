import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const BASE = `You are Juniper, a warm and perceptive financial guide. You're helping the user think through their financial plan.

Conversational style:
- Warm, direct, like a trusted friend who deeply understands personal finance.
- Acknowledge the emotional side of financial decisions, not just the math.
- Keep responses to 2 to 4 short paragraphs. No bullet-point walls.
- Plain language. Explain jargon immediately.

Writing rules (STRICT):
- ABSOLUTELY NO EM-DASHES. Do not use "—" (U+2014), "–" (U+2013), or "--". Use a comma, period, or rewrite the sentence. Re-read your response before sending.
- Never start a sentence with "honestly" or use "and honestly" as filler.
- Avoid colons to introduce mid-sentence lists casually.
- Prefer short sentences.

You are NOT a licensed advisor. If a question warrants a professional, mention it briefly.

This conversation is SCOPED to a specific plan the user has built. Stay grounded in the plan's actual numbers and goals below. If the user asks something unrelated to this plan, gently note that this is the plan-scoped chat and answer briefly, then steer back to the plan.`;

type PlanContext = {
  domain: string;
  has_partner?: boolean | null;
  partner_first_name?: string | null;
  goal?: { headline?: string; summary?: string; [k: string]: unknown } | null;
  current_state?: Record<string, unknown> | null;
  kpis?: Array<{ label: string; current: number; target: number; unit: string }>;
  milestones?: Array<{
    label: string;
    target_value: number;
    current_value: number;
    completed_at: string | null;
  }>;
  next_actions?: Array<{ label: string; completed: boolean }>;
};

function formatPlanContext(plan: PlanContext): string {
  const lines: string[] = [];
  lines.push(`\n--- The user's current ${plan.domain} plan ---`);

  if (plan.goal?.headline) lines.push(`Goal: ${plan.goal.headline}`);
  if (plan.goal?.summary) lines.push(`Summary: ${plan.goal.summary}`);

  if (plan.has_partner === true) {
    const name = plan.partner_first_name?.trim();
    lines.push(name ? `Planning with partner: ${name}` : `Planning with a partner`);
  } else if (plan.has_partner === false) {
    lines.push(`Planning solo`);
  }

  if (plan.current_state) {
    const cs = plan.current_state as Record<string, unknown>;
    const csLines: string[] = [];
    for (const [k, v] of Object.entries(cs)) {
      if (typeof v === "number") csLines.push(`  ${k}: ${v.toLocaleString()}`);
      else if (typeof v === "string") csLines.push(`  ${k}: ${v}`);
    }
    if (csLines.length > 0) lines.push("Current state:\n" + csLines.join("\n"));
  }

  if (plan.kpis && plan.kpis.length > 0) {
    lines.push("KPIs:");
    for (const k of plan.kpis) {
      lines.push(`  ${k.label}: ${k.current} / ${k.target} ${k.unit}`);
    }
  }

  if (plan.milestones && plan.milestones.length > 0) {
    lines.push("Milestones:");
    for (const m of plan.milestones) {
      const status = m.completed_at ? " [completed]" : "";
      lines.push(`  ${m.label}: ${m.current_value} / ${m.target_value}${status}`);
    }
  }

  if (plan.next_actions && plan.next_actions.length > 0) {
    lines.push("Next actions:");
    for (const a of plan.next_actions) {
      lines.push(`  ${a.completed ? "[done] " : ""}${a.label}`);
    }
  }

  lines.push(`--- End of plan context ---\n`);
  return lines.join("\n");
}

type RequestBody = {
  domain: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  plan: PlanContext;
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
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
  const payload = await verifySupabaseJwt(token, { supabaseUrl, legacySecret });
  if (!payload?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const systemPrompt = BASE + "\n" + formatPlanContext(body.plan ?? { domain: body.domain });
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
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
