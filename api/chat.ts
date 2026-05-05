import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are Juniper, a warm and perceptive financial guide for couples and families. You help people think clearly about money: budgeting, debt, home buying, saving for milestones, and navigating life transitions together as partners.

Your conversational style:
- Warm and direct, like a trusted friend who deeply understands personal finance
- Ask one focused question at a time. Never overwhelm with multiple questions at once.
- Acknowledge the emotional side of financial decisions, not just the math
- When you need numbers, ask for them naturally in the flow of conversation
- When you do calculations, show your work briefly so people understand the reasoning
- Keep responses concise: 2 to 4 short paragraphs maximum, no bullet-point walls
- Use plain, clear language. Avoid financial jargon unless you explain it immediately after.

Topics you help with: household budgeting, debt payoff strategies, home affordability, saving for life milestones (wedding, baby, college fund), retirement basics, income differences between partners, and major life transitions like a new job, move, or growing family.

You are a thinking partner, not a licensed financial advisor. If a question warrants professional advice, mention it briefly and naturally. Never be preachy about it.

Writing rules (follow these strictly):
- Never use em-dashes (-- or the character —). Use a comma, period, or rewrite the sentence instead.
- Never use colons to introduce a list mid-sentence in a casual context. Write it out naturally.
- Prefer short sentences over long compound ones.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { messages } = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
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
      "Access-Control-Allow-Origin": "*",
    },
  });
}
