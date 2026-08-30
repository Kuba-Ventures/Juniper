// Demo household (Maya & Devin) for the Stage-2 UI port. Replaced by real
// Plaid transactions + the categorization/budget engine in Stage 3. Keep
// components reading these typed selectors so that swap is data-layer only.

// c1 to c7 are the seven chart colors. The three semantic tokens are here
// because the Stage-3b category groups need more than seven distinct wedges:
// `accent` and `ink-2` carry the two newest spending groups, and `good` / `ink-3`
// mark income and transfers (which never appear in the donut, only on rows).
// All four are already defined in both palettes in styles/juniper.css.
export type SeriesKey =
  | "--jnpr-c1" | "--jnpr-c2" | "--jnpr-c3" | "--jnpr-c4" | "--jnpr-c5" | "--jnpr-c6" | "--jnpr-c7"
  | "--jnpr-good" | "--jnpr-accent" | "--jnpr-ink-2" | "--jnpr-ink-3";

// `e` is the category's icon, for lists. `k` is its colour, for charts: an
// emoji cannot fill a donut arc, which is why both exist.
export interface SpendCat { c: string; v: number; k: SeriesKey; e?: string }
export interface Budget { c: string; s: number; l: number; e?: string }
export interface Txn { m: string; c: string; v: number; d: string; k: SeriesKey; e?: string; inc?: boolean; logo?: string | null }
export interface Account { n: string; i: string; v: number; k: SeriesKey; apr?: string }
export interface PlanIcon { }

export const netWorth = {
  value: 67330,
  changeAbs: 1940,
  changePct: 2.9,
  series: [52100, 53400, 54800, 55200, 57600, 58900, 60100, 61800, 62400, 64500, 65390, 67330],
  labels: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
  // Parallel to `series`: true where the point was reconstructed backward from
  // transactions rather than observed from live balances. Empty here because the
  // demo household has no reconstructed history, and read as false when absent,
  // so a shorter array is never a crash. This is what types the live payload's
  // own flags, see api/finances.ts.
  estimated: [] as boolean[],
};

export const cashflow = { income: 8240, spent: 5940, saved: 2300, month: "Aug" };

export const spending: SpendCat[] = [
  { c: "Housing", v: 2150, k: "--jnpr-c1" },
  { c: "Groceries & dining", v: 1180, k: "--jnpr-c2" },
  { c: "Transportation", v: 640, k: "--jnpr-c3" },
  { c: "Shopping", v: 520, k: "--jnpr-c4" },
  { c: "Utilities & bills", v: 410, k: "--jnpr-c5" },
  { c: "Kids & health", v: 340, k: "--jnpr-c6" },
  { c: "Everything else", v: 700, k: "--jnpr-c7" },
];

export const budgets: Budget[] = [
  { c: "Groceries & dining", s: 1180, l: 1100 },
  { c: "Transportation", s: 640, l: 700 },
  { c: "Shopping", s: 520, l: 450 },
  { c: "Utilities & bills", s: 410, l: 450 },
];

export const transactions: Txn[] = [
  { m: "Trader Joe's", c: "Groceries & dining", v: -96.4, d: "Aug 1", k: "--jnpr-c2" },
  { m: "Payroll, Devin", c: "Income", v: 3120, d: "Aug 1", k: "--jnpr-good", inc: true },
  { m: "Shell", c: "Transportation", v: -52.1, d: "Jul 31", k: "--jnpr-c3" },
  { m: "Target", c: "Shopping", v: -134.2, d: "Jul 30", k: "--jnpr-c4" },
  { m: "Rent, Oakwood", c: "Housing", v: -2150, d: "Jul 28", k: "--jnpr-c1" },
  { m: "Spotify", c: "Utilities & bills", v: -11.99, d: "Jul 28", k: "--jnpr-c5" },
  { m: "Whole Foods", c: "Groceries & dining", v: -72.15, d: "Jul 27", k: "--jnpr-c2" },
  { m: "Chevron", c: "Transportation", v: -48.3, d: "Jul 26", k: "--jnpr-c3" },
];

export const accounts: { cash: Account[]; invest: Account[]; debt: Account[] } = {
  cash: [
    { n: "Chase Checking", i: "Chase", v: 4820, k: "--jnpr-c3" },
    { n: "Ally HYSA", i: "4.20% APY", v: 18400, k: "--jnpr-c1" },
  ],
  invest: [
    { n: "Fidelity Brokerage", i: "Fidelity", v: 14250, k: "--jnpr-c5" },
    { n: "Vanguard 401(k)", i: "Vanguard", v: 63900, k: "--jnpr-c1" },
  ],
  debt: [
    { n: "Chase Sapphire", i: "Credit card", v: -2180, apr: "24.9%", k: "--jnpr-c4" },
    { n: "Student loans", i: "Earnest", v: -22400, apr: "5.8%", k: "--jnpr-c2" },
    { n: "Toyota auto loan", i: "auto", v: -9460, apr: "6.4%", k: "--jnpr-c6" },
  ],
};

// The demo household's five plans that used to sit here are gone, along with the
// `Plan` shape they filled. The Score page was the last surface reading them: it
// used them as a lookup to cross-link each "way to improve" to a plan, so the
// levers under a score computed from the member's own balances pointed at a home
// purchase, student loans and a baby fund belonging to nobody. That page reads
// the member's real plans through `useMemberPlans()` now, the same source as the
// Plans page and Overview, and decides what counts as a plan for a lever from
// the plan's own shape.

// The subscription seeds that used to sit here are gone, along with the Overview
// panel they fed. Nothing in Juniper detects a recurring charge: no endpoint, no
// table, no rule. Worse, the panel was gated on the member having real
// transactions, so the only people who ever saw those eight rows were the ones
// with a real feed, reading invented charges as their own.

export type FactorKey = "savings" | "emergency" | "debt" | "investing" | "credit";
export type FactorStatus = "strong" | "fair" | "weak";
// Mirrors FactorGauge in lib/score.ts and api/_score.ts. Declared here too
// because this file is what types the payload the Score page reads, and the page
// needs the field to draw each factor's rail.
export interface ScoreGauge {
  now: number;
  target: number;
  unit: "money" | "percent";
  nowNote: string;
  targetNote: string;
  invert: boolean;
}
export interface ScoreFactor { key: FactorKey; label: string; score: number; weight: number; status: FactorStatus; detail: string; gauge: ScoreGauge | null }
// No `planIcon`. The engines used to stamp each improvement with a demo plan's
// icon name so the Score page could look that plan up; the page matches the
// member's own plans on `factor` now, so the field went with the seeds it keyed
// into. Keep it out: it was the only route by which a lever could name a plan
// nobody has.
export interface ScoreImprovement { factor: FactorKey; title: string; detail: string; potentialPts: number }
export interface Score {
  value: number;
  band: string;
  delta: number;
  lever: string;
  trend: number[];
  factors: ScoreFactor[];
  improvements: ScoreImprovement[];
}
export const score: Score = {
  value: 78,
  band: "Healthy",
  delta: 4,
  lever: "build your emergency fund",
  trend: [68, 70, 71, 73, 74, 75, 74, 78],
  factors: [
    { key: "savings", label: "Savings rate", score: 82, weight: 0.25, status: "strong", detail: "You're saving about 22% of your income, great pace.",
      gauge: { now: 2300, target: 1648, unit: "money", nowNote: "saved a month", targetNote: "target", invert: false } },
    { key: "emergency", label: "Emergency fund", score: 58, weight: 0.25, status: "fair", detail: "3.5 months of expenses saved, target is 6 months.",
      gauge: { now: 20790, target: 35640, unit: "money", nowNote: "in cash", targetNote: "six months of spending", invert: false } },
    { key: "debt", label: "Debt load", score: 71, weight: 0.20, status: "fair", detail: "Your debt is about 0.9× your annual income, moderate.",
      gauge: { now: 88992, target: 29664, unit: "money", nowNote: "owed", targetNote: "ceiling, stay under", invert: true } },
    { key: "investing", label: "Investing pace", score: 74, weight: 0.15, status: "fair", detail: "You've invested about 0.7× your annual income, keep contributing.",
      gauge: { now: 69216, target: 98880, unit: "money", nowNote: "invested", targetNote: "one year of income", invert: false } },
    { key: "credit", label: "Credit health", score: 88, weight: 0.15, status: "strong", detail: "Credit score 726, good.", gauge: null },
  ],
  improvements: [
    { factor: "emergency", title: "Build your emergency fund", detail: "Aim for 6 months of expenses in an accessible high-yield account.", potentialPts: 11 },
    { factor: "debt", title: "Pay down high-interest debt", detail: "Target the highest-APR balance first to lighten your debt load.", potentialPts: 6 },
    { factor: "investing", title: "Invest more consistently", detail: "Increase automatic contributions to keep your investing pace on track.", potentialPts: 4 },
  ],
};

// The credit-score and credit-card seeds that used to sit here are gone. The
// Credit tab reads real card balances and limits off the caller's linked Plaid
// items now, and no credit-data provider is wired up anywhere in Juniper, so a
// hardcoded score/band/trend read as the member's own when it never was.

export interface Listing {
  n: string; cat: string; logo: string; k: SeriesKey; stat: string; blurb: string;
  tags: string[]; src: "curated" | "self"; match?: string; use?: boolean;
}
export const listings: Listing[] = [
  { n: "SoFi", cat: "Debt", logo: "S", k: "--jnpr-c2", stat: "0% APR · 21 mo", blurb: "Balance transfers with no interest for up to 21 months and no annual fee.", tags: ["Balance transfer", "No fee"], src: "curated", match: "your Sapphire card is at 24.9% APR" },
  { n: "Marcus", cat: "Saving", logo: "M", k: "--jnpr-c1", stat: "4.30% APY", blurb: "High-yield savings with no minimums and no fees.", tags: ["No minimums"], src: "curated", match: "$4,820 is sitting in ~0% checking" },
  { n: "Earnest", cat: "Debt", logo: "E", k: "--jnpr-c4", stat: "from 4.9% APR", blurb: "Refinance your student loans with flexible terms and no fees.", tags: ["Student refi"], src: "curated", match: "you owe $22.4k in student loans at 5.8%" },
  { n: "Ally", cat: "Banking", logo: "A", k: "--jnpr-c3", stat: "Checking + HYSA", blurb: "Online checking and savings that play nicely with everything.", tags: ["Checking", "HYSA"], src: "curated", use: true },
  { n: "Fidelity", cat: "Investing", logo: "F", k: "--jnpr-c5", stat: "$0 commissions", blurb: "Roth IRA and brokerage with no commissions on stocks & ETFs.", tags: ["Roth IRA"], src: "curated", use: true },
  { n: "Policygenius", cat: "Insurance", logo: "P", k: "--jnpr-c6", stat: "Term life", blurb: "Compare term life quotes from top carriers in a few minutes.", tags: ["Term life"], src: "curated" },
  { n: "Betterment", cat: "Investing", logo: "B", k: "--jnpr-c3", stat: "Auto-invest", blurb: "Automated, low-fee portfolios that rebalance for you.", tags: ["Robo-advisor"], src: "self" },
  { n: "Trust & Will", cat: "Estate", logo: "T", k: "--jnpr-c1", stat: "Wills & trusts", blurb: "Set up a legal will or trust online, worth it before the baby arrives.", tags: ["Wills", "Trusts"], src: "curated" },
  { n: "Wealthfront", cat: "Saving", logo: "W", k: "--jnpr-c5", stat: "4.25% APY", blurb: "Cash account with automated saving buckets and no fees.", tags: ["4.25% APY"], src: "self" },
];
export const listingCategories = ["All", "Banking", "Saving", "Debt", "Investing", "Insurance", "Estate"];

// Merchant/brand -> logo key (see mock-logos.ts). Falls back to a monogram tile.
export const LOGO_KEY: Record<string, string> = {
  SoFi: "sofi", Marcus: "marcus", Earnest: "earnest", Ally: "ally", Fidelity: "fidelity",
  Policygenius: "policygenius", Betterment: "betterment", "Trust & Will": "trustwill", Wealthfront: "wealthfront",
  "Chase Checking": "chase", "Ally HYSA": "ally", "Fidelity Brokerage": "fidelity", "Vanguard 401(k)": "vanguard",
  "Chase Sapphire": "chase", "Student loans": "earnest", "Toyota auto loan": "toyota",
  "Trader Joe's": "traderjoes", Shell: "shell", Target: "target", Spotify: "spotify", "Whole Foods": "wholefoods", Chevron: "chevron",
  Netflix: "netflix", "Planet Fitness": "planetfitness", "Adobe Creative Cloud": "adobe", "iCloud+": "apple",
  "ChatGPT Plus": "openai", "The New York Times": "nyt", "Amazon Prime": "amazon",
  "Capital One Quicksilver": "capitalone", "Chase Sapphire Preferred": "chase", "Amex Blue Cash": "amex",
};

export const money = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const moneyK = (n: number) => "$" + (Math.abs(n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "k";
export const money2 = (n: number) => (n < 0 ? "−" : "+") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
