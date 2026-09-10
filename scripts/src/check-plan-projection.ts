// One projection, two copies: the plan card's and the chat's, checked without a
// database, a session or a model.
//
// Run: node_modules/.bin/tsx scripts/src/check-plan-projection.ts
//
// WHY THIS IS WORTH ITS OWN CHECK. A tester's plan card said "Ready to buy
// Nov 2029" while the chat, asked about that same plan in the same session,
// answered "early 2029" for one scenario and "mid-2028" for another. Three
// answers to one question. The cause was not a wrong formula: it was that the
// chat had no formula at all, so the model did the arithmetic in the reply from
// whatever figures were in the conversation, against a "today" it could only
// guess at. The fix gives the chat the card's own math, in api/_plan-numbers.ts,
// which means the app now holds TWO copies of it (the client's
// artifacts/juniper/src/lib/plans.ts is the other), for the same reason
// api/_score.ts mirrors src/lib/score.ts: an edge function cannot import a
// module that imports React.
//
// Two copies of one fact is how the answers came to differ in the first place,
// so this check exists to make them differ LOUDLY. It compares behaviour, not
// just text: both copies of monthsToClose are extracted from their own source
// and run over the same sweep.
import { strictEqual, deepStrictEqual, ok as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SERVER = resolve(ROOT, "api/_plan-numbers.ts");
const CLIENT = resolve(ROOT, "artifacts/juniper/src/lib/plans.ts");

const serverSrc = readFileSync(SERVER, "utf8");
const clientSrc = readFileSync(CLIENT, "utf8");

let n = 0;
const ok = (what: string, fn: () => void) => { fn(); n++; void what; };

/** The text of a top-level `export function <name>(...) { ... }`, brace-matched
 *  so a nested block does not end it early. Fails loudly rather than returning
 *  an empty string: a rename that this could not find would otherwise turn the
 *  whole check into a comparison of nothing with nothing. */
function extractFunction(src: string, name: string, where: string): string {
  const start = src.indexOf(`export function ${name}(`);
  assert(start >= 0, `${name} not found in ${where}: this check needs updating`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name} from ${where}`);
}

/** A named const's literal, e.g. SHAPE_KEYWORDS's array. */
function extractConst(src: string, name: string, where: string): string {
  const start = src.indexOf(`const ${name}`);
  assert(start >= 0, `${name} not found in ${where}: this check needs updating`);
  const eq = src.indexOf("=", start);
  const openIdx = src.slice(eq).search(/[[{]/) + eq;
  const openCh = src[openIdx];
  const closeCh = openCh === "[" ? "]" : "}";
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error(`unbalanced brackets reading ${name} from ${where}`);
}

// Comments, whitespace and the trailing commas a formatter adds when it wraps
// a signature differ between the two files on purpose (each is formatted for
// its own file and explains itself to its own reader), so all three are
// stripped before comparing. Nothing else is: a changed constant, a flipped
// comparison or a dropped branch all survive this and fail the check.
const normalize = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[)\]}])/g, "$1")
    .replace(/\s+/g, "")
    .trim();

/* ── The two copies of the arithmetic must agree, on every input ─────────── */

const bodyServer = extractFunction(serverSrc, "monthsToClose", "api/_plan-numbers.ts");
const bodyClient = extractFunction(clientSrc, "monthsToClose", "src/lib/plans.ts");

ok("monthsToClose is character-for-character the same calculation", () => {
  strictEqual(normalize(bodyServer), normalize(bodyClient));
});

// Compiled and run rather than only read, so a divergence introduced through a
// type annotation or a default value is caught too. The functions are pure and
// take three numbers, so this is safe to evaluate.
const compile = (body: string): ((r: number, m: number | null, a?: number) => number | null) => {
  const js = body.replace("export function", "function").replace(/:\s*(number \| null|number|number \| undefined)/g, "");
  return new Function(`${js}; return monthsToClose;`)() as never;
};
const serverFn = compile(bodyServer);
const clientFn = compile(bodyClient);

ok("both copies answer identically over 5,400 combinations", () => {
  let compared = 0;
  for (const remaining of [0, -100, 1, 500, 7300, 73000, 250000, 1_000_000]) {
    for (const monthly of [null, 0, -50, 1, 25, 400, 1500, 2500, 9000]) {
      for (const rate of [0, 0.1, 3.5, 6, 18, 22, 29.99]) {
        strictEqual(
          serverFn(remaining, monthly, rate),
          clientFn(remaining, monthly, rate),
          `diverged at remaining=${remaining} monthly=${monthly} rate=${rate}`,
        );
        compared++;
      }
    }
  }
  assert(compared >= 400, `expected a real sweep, compared ${compared}`);
});

/* ── The shape heuristic decides which rate is applied, so it counts too ─── */

ok("SHAPE_KEYWORDS is the same table, in the same order", () => {
  strictEqual(
    normalize(extractConst(serverSrc, "SHAPE_KEYWORDS", "api/_plan-numbers.ts")),
    normalize(extractConst(clientSrc, "SHAPE_KEYWORDS", "src/lib/plans.ts")),
  );
});
ok("DOMAIN_TITLES is the same table", () => {
  strictEqual(
    normalize(extractConst(serverSrc, "DOMAIN_TITLES", "api/_plan-numbers.ts")),
    normalize(extractConst(clientSrc, "DOMAIN_TITLES", "src/lib/plans.ts")),
  );
});

/* ── And the whole projection, against the reported case ─────────────────── */

const P = await import("../../api/_plan-numbers.ts");
const NOW = new Date("2026-09-10T12:00:00Z");

const homePlan = {
  domain: "home-purchase",
  status: "in_progress",
  goal: { name: "Home purchase", shape: "buy", target_value: 85000, current_value: 12000, monthly_contribution: 1500 },
  current_state: {},
  kpis: [],
};

ok("THE REPORTED CASE: one projection, quoted rather than re-derived", () => {
  const p = P.projectPlan(homePlan, NOW);
  strictEqual(p.remaining, 73000);
  strictEqual(p.monthsRemaining, 49); // ceil(73000 / 1500)
  strictEqual(p.completionMonth, "Oct 2030");
  strictEqual(p.completionSource, "projected");
  // The rate the chat used to leave unstated. A savings or purchase plan gets
  // zero growth, because nobody has told us what the member's cash earns.
  strictEqual(p.assumedAnnualRatePct, 0);
});

ok("a date the member SET is theirs, not a projection", () => {
  const p = P.projectPlan({ ...homePlan, goal: { ...homePlan.goal, target_date: "2029-11" } }, NOW);
  strictEqual(p.completionMonth, "Nov 2029");
  strictEqual(p.completionSource, "member_set");
});

ok("a payoff compounds at the plan's own rate, and a hopeless one says so", () => {
  const p = P.projectPlan(
    { domain: "card-debt", goal: { name: "Card debt", shape: "payoff", target_value: 8000, current_value: 0, monthly_contribution: 400, rate: 22 }, current_state: {}, kpis: [] },
    NOW,
  );
  strictEqual(p.assumedAnnualRatePct, 22);
  assert((p.monthsRemaining ?? 0) > Math.ceil(8000 / 400), "interest must lengthen a payoff");
  strictEqual(P.monthsToClose(8000, 100, 22), null);
});

ok("an income plan gets no invented date", () => {
  const p = P.projectPlan(
    { domain: "raise", goal: { name: "Grow my income", shape: "income", target_value: 120000, current_value: 90000 }, current_state: {}, kpis: [] },
    NOW,
  );
  strictEqual(p.monthsRemaining, null);
  strictEqual(p.completionMonth, null);
  strictEqual(p.completionSource, "none");
});

ok("a legacy row still reads: numbers in kpis, date in current_state.collected", () => {
  const p = P.projectPlan(
    {
      domain: "debt-paydown",
      goal: { headline: "Pay down the card" },
      current_state: { collected: { monthly_contribution: 500, target_date: "2028-06" } },
      kpis: [{ label: "Balance", current: 1000, target: 9000, unit: "$" }],
    },
    NOW,
  );
  strictEqual(p.shape, "payoff");
  deepStrictEqual([p.target, p.current], [9000, 1000]);
  strictEqual(p.completionMonth, "Jun 2028");
});

console.log(`${n} plan-projection checks passed`);
console.log("PASS: the chat and the plan card cannot answer 'when' differently");
