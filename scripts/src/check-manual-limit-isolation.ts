// Proves that a member-typed credit limit cannot reach the Juniper Score.
//
// Run: pnpm --filter @workspace/scripts run check-manual-limit-isolation
//
// WHY THIS IS A SCRIPT RATHER THAN A COMMENT. Migration 0046 lets a member enter
// a credit card by hand with its own limit, for a card Plaid can never reach: an
// authorized-user card on another person's login is invisible to every credential
// the member holds. That limit is counted into the Credit page's utilization,
// where it is badged "You added this", and it must NEVER be counted into the
// Juniper Score, because the Score is a figure Juniper asserts from what it can
// measure. A member able to move it by typing a bigger number would be scoring
// themselves, which is a different product.
//
// The isolation is structural: `fetchManualAccounts`, the shared read the score
// path uses, does not request the column, and `fetchManualCreditAccounts`, which
// does, is only ever imported by the Credit page's endpoint. Structural beats a
// convention, but only while somebody has not quietly widened the shared select,
// and that is a two-character edit in a file nobody reads while thinking about
// scores. So the four facts that hold it up are asserted here instead.
//
// The same rule already governs `member_cards.credit_limit` (#211, migration
// 0033), and it is checked here too, since it is the same decision.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

const failures: string[] = [];
const checks: string[] = [];
function assert(ok: boolean, what: string, detail: string) {
  if (ok) checks.push(what);
  else failures.push(`${what}\n    ${detail}`);
}

// Comments TALK about credit_limit in these files on purpose, at length, to say
// why it is absent. Only code counts, so comment lines are dropped first.
const codeOf = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const s = l.trim();
      return s !== "" && !s.startsWith("//") && !s.startsWith("*") && !s.startsWith("/*");
    })
    .join("\n");

// ---- 1. The shared read must not request the column -------------------------
//
// Read by api/_finance-snapshot.ts (Score inputs), api/plaid/networth-snapshot.ts,
// api/plaid/networth-backfill.ts and api/finances.ts. The score path cannot read
// what it is never handed, and this is the line that decides that.
const manualSrc = read("api/_manual-accounts.ts");
const sharedSelect = /manual_accounts\?user_id=eq\.\$\{uid\}&select=([^&`]+)/.exec(manualSrc);
assert(
  sharedSelect != null && !sharedSelect[1].includes("credit_limit"),
  "the shared fetchManualAccounts select does not request credit_limit",
  sharedSelect
    ? `it now selects: ${sharedSelect[1]}`
    : "could not find the shared select at all, so this check proves nothing: fix the pattern",
);

// ---- 2. The score engines must not name the column at all ------------------
for (const file of ["api/_score.ts", "api/_finance-snapshot.ts", "artifacts/juniper/src/lib/score.ts"]) {
  assert(
    !codeOf(read(file)).includes("credit_limit"),
    `${file} contains no credit_limit in code`,
    "a member-supplied limit reaching the Score would make the Score member-editable",
  );
}

// ---- 3. Only the Credit page's endpoint may read the limit-bearing fetch ----
//
// A second importer is not automatically wrong, but it is exactly the change that
// should not happen quietly, so it fails here and asks for a decision.
const strayImporters: string[] = [];
for (const file of [
  "api/_score.ts", "api/_finance-snapshot.ts", "api/finances.ts",
  "api/plaid/networth-snapshot.ts", "api/plaid/networth-backfill.ts",
  "api/manual-accounts.ts", "api/member-cards.ts",
]) {
  if (read(file).includes("fetchManualCreditAccounts")) strayImporters.push(file);
}
assert(
  strayImporters.length === 0,
  "fetchManualCreditAccounts is imported only by api/card-rewards.ts",
  `also imported by: ${strayImporters.join(", ")}`,
);

// ---- 4. The database itself refuses a limit outside the credit category ----
//
// So the rule survives a write that never goes through the endpoint.
const mig = read("supabase/migrations/0046_manual_account_credit.sql");
assert(
  /CHECK \(credit_limit IS NULL OR category = 'credit'\)/.test(mig),
  "0046 CHECKs that a limit only exists on a credit account",
  "without it a limit could be stored against a checking account",
);
assert(
  /CHECK \(credit_limit IS NULL OR credit_limit > 0\)/.test(mig),
  "0046 CHECKs that a limit is positive",
  "zero would make the utilization division an infinity",
);
// The migration is applied by hand, by pasting it, and a byte above ASCII has
// mangled a paste in this repo before: see docs/CARD_REWARDS.md.
assert(
  // eslint-disable-next-line no-control-regex
  !/[^\x00-\x7F]/.test(mig),
  "0046 is pure ASCII",
  "a non-ASCII byte can be mangled by the paste that applies the migration",
);

// ---- 5. A NAMED manual card stays identity-only (migration 0047) -----------
//
// The second rule this file exists to hold. A hand-entered card can now say which
// catalog product it is, which buys it a name, a brand colour and art. It must buy
// nothing else: the earning guide, the switch ideas and the upgrade rows are
// computed from per-ACCOUNT spend keyed on `transactions.account_id`, and a
// hand-entered account has none, ever. A product reaching the rewards maths would
// produce "$0 a year lost on this card" from an empty spend set, which is missing
// data dressed as a finding.
//
// `identityOf` is the seam. It resolves exactly the presentation fields and is
// the only thing that may read a manual row's product.
const cards = read("api/card-rewards.ts");
const cardsCode = codeOf(cards);
assert(
  /const identityOf =/.test(cardsCode),
  "api/card-rewards.ts resolves a manual product through identityOf",
  "without that seam there is nothing keeping a manual product out of the rewards maths",
);
// The rewards map is built from featured CATALOG rows and nothing else. If a
// manual row's product were ever added to it, this stops being true.
assert(
  /const products = new Map<string, CardProduct>\(\s*featuredRows\.map/.test(cardsCode),
  "the rewards `products` map is still built from featuredRows alone",
  "a manual product added here would reach the guide, switches and upgrades",
);
// `m.product_id` is a manual row's field. It may be read to resolve identity and
// nowhere else, so exactly one reference is expected.
const manualProductReads = (cardsCode.match(/m\.product_id/g) ?? []).length;
assert(
  manualProductReads === 1,
  "a manual row's product_id is read exactly once, to resolve identity",
  `found ${manualProductReads} references; a second one is the change that needs a decision`,
);
const mig47 = read("supabase/migrations/0047_manual_account_product.sql");
assert(
  /CHECK \(product_id IS NULL OR category = 'credit'\)/.test(mig47),
  "0047 CHECKs that a product only exists on a credit account",
  "a product on a checking account is meaningless",
);
assert(
  // eslint-disable-next-line no-control-regex
  !/[^\x00-\x7F]/.test(mig47),
  "0047 is pure ASCII",
  "a non-ASCII byte can be mangled by the paste that applies the migration",
);

// ---- 6. #211's member limit is held to the same rule ----------------------
const mig33 = read("supabase/migrations/0033_member_card_limit.sql");
assert(
  /member_cards_credit_limit_positive/.test(mig33),
  "0033's member_cards.credit_limit is still positive-only",
  "the same division would break on zero",
);

for (const c of checks) console.log(`  ok  ${c}`);
if (failures.length) {
  console.error(`\nFAIL: ${failures.length} of ${checks.length + failures.length} checks failed\n`);
  for (const f of failures) console.error(`  --  ${f}`);
  process.exit(1);
}
console.log(
  `\n${checks.length} checks passed: a member-typed credit limit is counted in utilization and ` +
  `cannot reach the Juniper Score, and a named hand-entered card carries identity only`,
);
