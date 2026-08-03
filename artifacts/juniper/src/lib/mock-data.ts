// Demo household (Maya & Devin) for the Stage-2 UI port. Replaced by real
// Plaid transactions + the categorization/budget engine in Stage 3. Keep
// components reading these typed selectors so that swap is data-layer only.

export type SeriesKey =
  | "--jnpr-c1" | "--jnpr-c2" | "--jnpr-c3" | "--jnpr-c4" | "--jnpr-c5" | "--jnpr-c6" | "--jnpr-c7"
  | "--jnpr-good";

export interface SpendCat { c: string; v: number; k: SeriesKey }
export interface Budget { c: string; s: number; l: number }
export interface Txn { m: string; c: string; v: number; d: string; k: SeriesKey; inc?: boolean }
export interface Account { n: string; i: string; v: number; k: SeriesKey; apr?: string }
export interface PlanIcon { }
export interface Plan {
  t: string; ab: string; icon?: string; saved: number; target: number; pct: number;
  note: string; st: "ok" | "new" | "setup" | "done"; stl: string; k: SeriesKey;
  monthly?: string; date?: string; traj?: number[]; down?: boolean; done?: boolean; next: string;
  rec?: { save: number; h: string; p: string; partner: string };
}

export const netWorth = {
  value: 67330,
  changeAbs: 1940,
  changePct: 2.9,
  series: [52100, 53400, 54800, 55200, 57600, 58900, 60100, 61800, 62400, 64500, 65390, 67330],
  labels: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
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
  { m: "Payroll — Devin", c: "Income", v: 3120, d: "Aug 1", k: "--jnpr-good", inc: true },
  { m: "Shell", c: "Transportation", v: -52.1, d: "Jul 31", k: "--jnpr-c3" },
  { m: "Target", c: "Shopping", v: -134.2, d: "Jul 30", k: "--jnpr-c4" },
  { m: "Rent — Oakwood", c: "Housing", v: -2150, d: "Jul 28", k: "--jnpr-c1" },
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

export const plans: Plan[] = [
  { t: "Buy a home", ab: "H", icon: "home", saved: 28000, target: 60000, pct: 47, note: "Down payment · Mar 2027", st: "ok", stl: "On track", k: "--jnpr-c1", monthly: "$850/mo", date: "Ready Mar 2027", traj: [12, 15, 18, 20, 23, 25, 27, 28], next: "Auto-transfer $850/mo to the Ally HYSA" },
  { t: "Pay off student loans", ab: "S", icon: "debt", saved: 0, target: 0, pct: 38, note: "$22,400 left · 5.8%", st: "ok", stl: "On track", k: "--jnpr-c2", monthly: "$520/mo", date: "Debt-free 2029", traj: [30, 28.6, 27.2, 26, 24.9, 23.8, 22.9, 22.4], down: true, next: "Keep paying $520/mo — debt-free by 2029", rec: { save: 540, h: "Speed up this plan", p: "Move your Sapphire balance off 24.9% APR — frees ~$45/mo toward the payoff.", partner: "SoFi" } },
  { t: "Baby fund", ab: "B", icon: "baby", saved: 4200, target: 12000, pct: 35, note: "Started 3 weeks ago", st: "new", stl: "New", k: "--jnpr-c5", monthly: "Not set", date: "Due Feb 2027", traj: [0.5, 1, 1.6, 2.4, 3, 3.4, 3.9, 4.2], next: "Set a monthly amount to stay on pace" },
  { t: "Combine finances", ab: "C", icon: "combine", saved: 0, target: 0, pct: 0, note: "2 steps left in setup", st: "setup", stl: "Setup", k: "--jnpr-c3", next: "Invite Devin to finish linking accounts" },
  { t: "Wedding fund", ab: "W", icon: "wedding", saved: 18000, target: 18000, pct: 100, note: "Completed Jun 2025", st: "done", stl: "Completed", k: "--jnpr-c6", done: true, monthly: "—", date: "Reached Jun 2025", traj: [3, 6, 9, 12, 14, 16, 17.5, 18], next: "Goal reached — rolled the surplus into the home down payment" },
];

export interface Subscription { n: string; cat: string; amt: number; next: string; k: SeriesKey; flag?: string; canceled?: boolean }
export const subscriptions: Subscription[] = [
  { n: "Netflix", cat: "Streaming", amt: 22.99, next: "Aug 12", k: "--jnpr-c4", flag: "Price rose $3 in June" },
  { n: "Planet Fitness", cat: "Fitness", amt: 24.99, next: "Aug 15", k: "--jnpr-c1", flag: "Not used in 2 months" },
  { n: "Adobe Creative Cloud", cat: "Software", amt: 59.99, next: "Aug 18", k: "--jnpr-c4", flag: "Not used in 3 months" },
  { n: "iCloud+", cat: "Storage", amt: 9.99, next: "Aug 20", k: "--jnpr-c3" },
  { n: "ChatGPT Plus", cat: "Software", amt: 20.0, next: "Aug 22", k: "--jnpr-c6" },
  { n: "The New York Times", cat: "News", amt: 17.0, next: "Aug 25", k: "--jnpr-c5" },
  { n: "Spotify", cat: "Music", amt: 11.99, next: "Aug 28", k: "--jnpr-c1" },
  { n: "Amazon Prime", cat: "Shopping", amt: 14.99, next: "Sep 3", k: "--jnpr-c2" },
];

export const score = {
  value: 78,
  band: "Healthy",
  delta: 4,
  lever: "build your emergency fund to 6 months",
};

export interface CreditAlert { t: string; d: string; dir: "up" | "down"; imp: string }
export interface CreditFactor { n: string; v: string; r: string; cls: "exc" | "good" | "fair" }
export const credit = {
  score: 726, band: "Good", delta: 8, updated: "Jul 28",
  trend: [690, 698, 705, 710, 712, 718, 718, 726],
  alerts: [
    { t: "Score went up 8 points", d: "Jul 28", dir: "up", imp: "+8" },
    { t: "Credit utilization rose to 34%", d: "Jul 22", dir: "down", imp: "▼" },
    { t: "On-time payment reported — Toyota Financial", d: "Jul 15", dir: "up", imp: "▲" },
    { t: "New hard inquiry — auto loan", d: "Jun 30", dir: "down", imp: "−5" },
  ] as CreditAlert[],
  factors: [
    { n: "Payment history", v: "100% on-time", r: "Excellent", cls: "exc" },
    { n: "Credit utilization", v: "34% — aim under 30%", r: "Fair", cls: "fair" },
    { n: "Age of credit", v: "6 yr 4 mo average", r: "Good", cls: "good" },
    { n: "Total accounts", v: "9 accounts", r: "Good", cls: "good" },
    { n: "Hard inquiries", v: "2 in the last 2 years", r: "Fair", cls: "fair" },
    { n: "Derogatory marks", v: "None", r: "Excellent", cls: "exc" },
  ] as CreditFactor[],
};

export interface CreditCard { n: string; bal: number; limit: number; apr: string; k: SeriesKey }
export const creditCards: CreditCard[] = [
  { n: "Capital One Quicksilver", bal: 1310, limit: 2500, apr: "26.1%", k: "--jnpr-c2" },
  { n: "Chase Sapphire Preferred", bal: 2180, limit: 5800, apr: "24.9%", k: "--jnpr-c4" },
  { n: "Amex Blue Cash", bal: 640, limit: 4000, apr: "22.4%", k: "--jnpr-c3" },
];

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
  { n: "Trust & Will", cat: "Estate", logo: "T", k: "--jnpr-c1", stat: "Wills & trusts", blurb: "Set up a legal will or trust online — worth it before the baby arrives.", tags: ["Wills", "Trusts"], src: "curated" },
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
