import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const BASE_PROMPT = `You are Juniper, a warm and perceptive financial guide. You help people think clearly about money: budgeting, debt, home buying, saving for milestones, and navigating life transitions.

Your conversational style:
- Warm and direct, like a trusted friend who deeply understands personal finance
- Ask one focused question at a time. Never overwhelm with multiple questions at once.
- Acknowledge the emotional side of financial decisions, not just the math
- When you need numbers, ask for them naturally in the flow of conversation
- When you do calculations, show your work briefly so people understand the reasoning
- Keep responses concise: 2 to 4 short paragraphs maximum, no bullet-point walls
- Use plain, clear language. Avoid financial jargon unless you explain it immediately after.

Topics you help with: household budgeting, debt payoff strategies, home affordability, saving for life milestones (wedding, baby, college fund), retirement basics, and major life transitions like a new job, move, or growing family.

You are a thinking partner, not a licensed financial advisor. If a question warrants professional advice, mention it briefly and naturally. Never be preachy about it.

Writing rules (follow these strictly):
- Never use em-dashes (-- or the character —). Use a comma, period, or rewrite the sentence instead.
- Never use the phrase "and honestly" or "honestly" as a sentence opener or filler.
- Never use colons to introduce a list mid-sentence in a casual context. Write it out naturally.
- Prefer short sentences over long compound ones.`;

const SOLO_CONTEXT = `
User context (critical — follow this exactly):
- You are speaking with one person only. They have not added a partner to this app.
- Always use singular "you" and "your". Never say "you two", "you both", "between you", "you each", "your partner", or any language that implies a second person.
- Do not infer a partner from anything the user says, no matter how it sounds. If they mention another person by name or say "we", reflect it back neutrally without assuming it is a romantic partner or that the other person's finances are shared.
- This perspective is fixed until a partner is explicitly added to their account.`;

const PARTNER_CONTEXT = `
User context:
- This user has a partner. You may refer to "you two", "you and your partner", or "you both" naturally when it fits.
- Treat their finances as a shared household unless told otherwise.`;

function buildSystemPrompt(hasPartner: boolean): string {
  return BASE_PROMPT + (hasPartner ? PARTNER_CONTEXT : SOLO_CONTEXT);
}

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

  const { messages, hasPartner = false } = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    hasPartner?: boolean;
  };

  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildSystemPrompt(hasPartner),
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
