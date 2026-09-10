// The AI financial planner, the "planner layer" that sees the user's real,
// server-verified finances and answers grounded questions. Unlike the older
// /api/chat (which trusted a client-supplied profile string), this endpoint
// fetches the snapshot itself, scoped to the JWT's uid, and hands it to the
// model through a tool. Streaming SSE, same wire shape the client already reads.
import Anthropic from "@anthropic-ai/sdk";
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { fetchScoreInput } from "../_finance-snapshot";
import { adminRest } from "../_supabase-admin";
import { projectPlan, type PlanRow } from "../_plan-numbers";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = `You are Juniper, an AI financial planner. You help young individuals and families plan with clarity: budgeting, debt, buying a home, saving for a baby or education, building an emergency fund, investing basics, and life transitions.

You have three tools. Call them rather than guessing, and never invent a balance, a target, or a date.

- get_finances returns the user's own financial picture: income, spending, cash, debt, investments, emergency-fund months. Call it whenever a question depends on their situation, affordability, "can I…", pacing a goal, or anything that should reflect their actual numbers. Some figures may be the user's own saved estimates rather than measured from a linked account; the tool names exactly which in an "estimated" list, and its "source" field says which picture you are looking at. Treat an estimate as a real figure the user gave you, use it, and say once that it is the figure they entered. Only when the tool reports hasData:false is there genuinely nothing on file: answer generally then, and invite them to link accounts or add their figures.
- get_plans returns the user's SAVED plans with the figures the plan cards show: target, saved so far, remaining, monthly contribution, and the finish month. A plan's numbers are saved server-side, so never tell the user you cannot see a plan's target without linked accounts. Call this whenever a plan is mentioned, including when the conversation is already scoped to one.
- project_plan answers "when would this be done" for a plan, optionally with a changed monthly contribution, target, or amount already saved.

Dates and timelines (strict):
- Never work out a finish date or a number of months yourself, and never state one from memory. Both tools return completionMonth; project_plan is how you answer any "what if I saved more" version of the question.
- Quote completionMonth exactly as given ("Nov 2029"), not a paraphrase of it ("late 2029", "early 2029"). The plan card in front of the user says that month, and a second wording of the same date reads as a second answer.
- The tools also return today's date. You have no other reliable idea of what today is.
- A savings plan is projected at 0% growth, and a payoff at the plan's own rate. Say so if a return matters to the answer, and do not swap in a rate the user never gave.

How you answer:
- Warm, direct, plain language. Explain any jargon right after you use it.
- Ground advice in the user's real numbers when you have them. Show the reasoning briefly so it's clear where a recommendation comes from.
- For a multi-goal question (e.g. saving for education while also buying a home), lay out the trade-off and a fundable pace for each, using their actual cash-flow.
- Keep it to a few short paragraphs. No bullet-point walls.

Compliance (always):
- You give educational guidance and are a thinking partner, not a licensed advisor, CPA, attorney, insurance agent, or mortgage broker.
- For entity formation, tax elections, estate or legal documents, and state-specific legal questions, give the general shape, then say plainly to confirm with a licensed CPA or attorney before acting. Same rule for anything that needs a signed policy or a locked rate: give the general shape, then say to confirm with a licensed agent or lender before acting.
- Never push a specific product or account provider. Explain what to compare instead.
- Never recommend a specific security, ticker, cryptocurrency, or individual stock, and never predict what one will do. Speak in terms of account types and asset classes (a low-cost index fund, a high-yield savings account, a target-date fund), never a specific pick. If asked to pick one, say that call belongs to the user or a licensed advisor and give the general shape of what to compare instead.
- Refuse to help hide assets, evade taxes, commit insurance or mortgage fraud, or otherwise mislead a lender, insurer, court, or the IRS, even framed as hypothetical or for someone else. Say plainly you won't help with that specific ask, then offer the legitimate version of what they're actually trying to solve if there is one (legal deductions instead of hiding income, for example).
- If a message mixes financial distress with signs of crisis (hopelessness, self-harm, suicidal thoughts), set the financial answer aside. Respond with care in plain language, note that a person trained for this can help right now (in the US: call or text 988, the Suicide & Crisis Lifeline), and encourage reaching out to someone they trust. Don't diagnose or attempt therapy.

Writing rules (strict):
- Never use em-dashes (— or --). Use a comma, period, or rewrite.
- Never open a sentence with "honestly" or use "and honestly" as filler.
- Prefer short sentences.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_finances",
    description:
      "Return the signed-in user's own financial snapshot: monthly income and spending, cash reserves, card and loan debt, investment balances, emergency-fund months, and annual income. Figures come from linked accounts where they exist and from the income/expenses the user saved themselves where they do not; the `estimated` array names which of them are the user's own figures rather than measured ones. Returns { hasData:false } only when the user has neither linked an account nor saved any figures. Call this whenever an answer should reflect the user's actual situation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_plans",
    description:
      "Return the signed-in user's SAVED plans, with the same figures and the same finish month their plan card shows: title, shape (save/buy/payoff/income), target amount, amount saved or paid off so far, amount remaining, monthly contribution, rate, months remaining, and completionMonth. Plans are stored server-side and are available whether or not the user has linked any accounts. Call this whenever the conversation touches a plan, a goal, a target amount, or a timeline.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "project_plan",
    description:
      "Project when a saved plan finishes, optionally under a change the user is considering. Uses the same arithmetic as the plan card, so its answer and the card's cannot disagree. Pass the plan's `domain` from get_plans. Any of monthly_contribution, target_value or current_value that you pass replaces that figure for this projection only; anything you omit keeps the plan's saved value. Use this for every 'what if I saved $X a month' question instead of working the date out yourself.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "The plan's `domain`, exactly as get_plans returned it." },
        monthly_contribution: { type: "number", description: "A different monthly amount to test." },
        target_value: { type: "number", description: "A different target amount to test." },
        current_value: { type: "number", description: "A different amount already saved or paid off." },
      },
      required: ["domain"],
    },
  },
];

type InMsg = { role: "user" | "assistant"; content: string };

/** UTC yyyy-mm-dd, handed to the model with every tool result: it has no other
 *  reliable idea of what today is, and a projection stated against the wrong
 *  "now" was half of the conflicting-dates bug (see api/_plan-numbers.ts). */
const todayIso = (now: Date) => now.toISOString().slice(0, 10);

export async function runGetFinances(uid: string, now: Date): Promise<string> {
  try {
    const snap = await fetchScoreInput(uid);
    if (!snap.hasData) return JSON.stringify({ hasData: false, linked: false, today: todayIso(now) });
    const { input, signals, estimated } = snap;
    return JSON.stringify({
      hasData: true,
      linked: snap.linked,
      // Named rather than left to be inferred from `estimated` being non-empty,
      // because the sentence the model owes the user differs: "from your linked
      // accounts" against "the figures you entered".
      source: estimated.length === 0 ? "linked_accounts" : snap.linked ? "linked_accounts_and_saved_figures" : "figures_you_saved",
      estimated,
      today: todayIso(now),
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
    return JSON.stringify({ hasData: false, linked: false, error: "snapshot_unavailable" });
  }
}

/** The caller's own plan rows. Service-role read scoped by user_id here, the
 *  same shape every other server-side read in this repo takes. */
async function fetchPlans(uid: string): Promise<PlanRow[]> {
  try {
    const r = await adminRest(`plans?user_id=eq.${uid}&select=domain,status,goal,current_state,kpis`);
    if (!r.ok) return [];
    return (await r.json()) as PlanRow[];
  } catch {
    return [];
  }
}

/** One plan, in the words and figures the plan card uses. */
function planForModel(plan: PlanRow, now: Date, overrides?: Partial<PlanRow["goal"]>) {
  const p = projectPlan(overrides ? { ...plan, goal: { ...(plan.goal ?? {}), ...overrides } } : plan, now);
  return {
    domain: p.domain,
    title: p.title,
    shape: p.shape,
    status: p.completed ? "completed" : "active",
    // A plan created for a household still belongs to this member's row but is
    // not on their personal Plans page, so it is flagged rather than silently
    // presented as one of their own.
    household: typeof plan.goal?.household_id === "string",
    target: p.target,
    savedSoFar: p.current,
    remaining: p.remaining,
    monthlyContribution: p.monthly,
    annualRatePct: p.rate,
    assumedAnnualRatePct: p.assumedAnnualRatePct,
    monthsRemaining: p.monthsRemaining,
    completionMonth: p.completionMonth,
    // "member_set" means the user picked this date, so it is a deadline rather
    // than a projection and must not be described as one; "projected" is this
    // plan's own pace; "none" means there is no monthly amount to pace from.
    completionSource: p.completionSource,
  };
}

export async function runGetPlans(uid: string, now: Date): Promise<string> {
  try {
    const plans = await fetchPlans(uid);
    return JSON.stringify({
      today: todayIso(now),
      plans: plans.map((p) => planForModel(p, now)),
    });
  } catch {
    return JSON.stringify({ plans: [], error: "plans_unavailable" });
  }
}

export async function runProjectPlan(uid: string, now: Date, raw: unknown): Promise<string> {
  try {
    const args = (raw ?? {}) as Record<string, unknown>;
    const domain = typeof args.domain === "string" ? args.domain : "";
    const plans = await fetchPlans(uid);
    const plan = plans.find((p) => p.domain === domain);
    if (!plan) {
      return JSON.stringify({ error: "no_such_plan", domains: plans.map((p) => p.domain), today: todayIso(now) });
    }
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const overrides: Record<string, number> = {};
    if (n(args.monthly_contribution) !== undefined) overrides.monthly_contribution = n(args.monthly_contribution)!;
    if (n(args.target_value) !== undefined) overrides.target_value = n(args.target_value)!;
    if (n(args.current_value) !== undefined) overrides.current_value = n(args.current_value)!;
    // A scenario is a projection, never the member's own saved deadline: a
    // target_date left in place would have this answer keep returning the date
    // they set no matter what the scenario changes, which is the opposite of
    // what was asked.
    const scenario = Object.keys(overrides).length > 0;
    return JSON.stringify({
      today: todayIso(now),
      scenario,
      applied: overrides,
      ...planForModel(plan, now, scenario ? { ...overrides, target_date: undefined } : undefined),
    });
  } catch {
    return JSON.stringify({ error: "projection_unavailable" });
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
      `\n\nThe user opened this chat from a specific plan or page. Stay grounded in it; if they drift far off-topic, answer briefly and steer back. The line below carries only the NAME, never the figures: call get_plans to match it to the saved plan and read that plan's real target, contribution and finish month.\n--- Plan in focus ---\n${body.planContext}\n--- end ---`
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
              // One `now` per round, so two tools answering the same turn
              // cannot straddle midnight and disagree about today.
              const now = new Date();
              const out =
                block.name === "get_finances"
                  ? await runGetFinances(uid, now)
                  : block.name === "get_plans"
                    ? await runGetPlans(uid, now)
                    : block.name === "project_plan"
                      ? await runProjectPlan(uid, now, block.input)
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
