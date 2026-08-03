// Mock data for the shared (couples) workspace — Stage 7 front-end. Real
// cross-partner data is a later backend stage; these shapes let the UI be built
// and reviewed now. "You" = the signed-in member (Maya in the demo); "partner"
// = the connected partner (Devin).
import type { SeriesKey } from "@/lib/mock-data";

export type Owner = "you" | "partner" | "shared";
export type Privacy = "shared" | "balance" | "private";

export interface SharedAccount { n: string; inst: string; v: number; owner: Owner; privacy: Privacy; k: SeriesKey }
export interface SharedGoal { t: string; icon: string; k: SeriesKey; target: number; you: number; partner: number }
export interface Bill { name: string; day: number; mo: string; payer: Owner; amount: number; soon?: boolean; split?: boolean }
export interface PrivacyToggle { key: string; title: string; sub: string; on: boolean; locked?: boolean }

export type ActivityItem =
  | { kind: "bill"; icon: string; title: string; meta: string; amount: number; cta?: string }
  | { kind: "txn"; icon: string; merchant: string; who: Owner; cat: string; amount: number; reacted?: boolean; thread?: { who: Owner; text: string }[] }
  | { kind: "goal"; icon: string; title: string; meta: string; pct: number; k: SeriesKey }
  | { kind: "msg"; who: Owner; text: string };

export const you = { name: "Maya", initial: "M", k: "--jnpr-c3" as SeriesKey };   // blue
export const partner = { name: "Devin", initial: "D", k: "--jnpr-c5" as SeriesKey }; // violet

export const combined = {
  netWorth: 186400,
  changeAbs: 3120,
  youShare: 104600,
  partnerShare: 81800,
};

export const sharedAccounts: SharedAccount[] = [
  { n: "Ally Joint Savings", inst: "House fund", v: 41200, owner: "shared", privacy: "shared", k: "--jnpr-c1" },
  { n: "Chase Joint Checking", inst: "Bills", v: 5840, owner: "shared", privacy: "shared", k: "--jnpr-c6" },
  { n: "Fidelity Brokerage", inst: "Maya", v: 62300, owner: "you", privacy: "balance", k: "--jnpr-c3" },
  { n: "Chase Checking", inst: "Maya", v: 8200, owner: "you", privacy: "balance", k: "--jnpr-c3" },
  { n: "Amex — personal", inst: "Maya", v: 0, owner: "you", privacy: "private", k: "--jnpr-c3" },
  { n: "Vanguard 401(k)", inst: "Devin", v: 54100, owner: "partner", privacy: "balance", k: "--jnpr-c5" },
  { n: "Ally HYSA", inst: "Devin", v: 46600, owner: "partner", privacy: "balance", k: "--jnpr-c5" },
  { n: "Student loan", inst: "Devin", v: -18900, owner: "partner", privacy: "shared", k: "--jnpr-c5" },
];

export const sharedGoals: SharedGoal[] = [
  { t: "Home down payment", icon: "home", k: "--jnpr-c1", target: 80000, you: 26000, partner: 15000 },
  { t: "Wedding", icon: "wedding", k: "--jnpr-c5", target: 30000, you: 6500, partner: 5500 },
];

export const bills: Bill[] = [
  { name: "Rent", day: 14, mo: "Aug", payer: "you", amount: 2400, soon: true },
  { name: "PG&E + Internet", day: 18, mo: "Aug", payer: "partner", amount: 210 },
  { name: "Car insurance", day: 22, mo: "Aug", payer: "shared", amount: 156, split: true },
  { name: "Streaming bundle", day: 27, mo: "Aug", payer: "shared", amount: 44, split: true },
];

export const activity: ActivityItem[] = [
  { kind: "bill", icon: "🔔", title: "Rent due in 3 days", meta: "Maya pays · Aug 14", amount: 2400, cta: "Nudge Maya" },
  { kind: "txn", icon: "🛒", merchant: "Whole Foods", who: "partner", cat: "Groceries · Aug 8", amount: 142.6, reacted: true,
    thread: [{ who: "partner", text: "what was this one? 👀" }, { who: "you", text: "groceries for Saturday's dinner party 🎉" }] },
  { kind: "goal", icon: "↑", title: "Devin added $500 to Home", meta: "2 days ago · now 51% funded", pct: 51, k: "--jnpr-c1" },
  { kind: "msg", who: "partner", text: "can we bump the wedding goal to $35k?" },
];

// What your partner can see FROM YOU. Shared goals are always on (you both joined).
export const privacyToggles: PrivacyToggle[] = [
  { key: "goals", title: "Shared goals & contributions", sub: "Always on for goals you both join", on: true, locked: true },
  { key: "joint", title: "Joint & shared account balances", sub: "Ally Joint, Chase Bills, split bills", on: true },
  { key: "balances", title: "My account balances (totals only)", sub: "Fidelity, 401(k) — the number, not the transactions", on: true },
  { key: "txns", title: "My individual transactions", sub: "Personal spending stays private", on: false },
  { key: "score", title: "My Juniper Score", sub: "Share your 0–100 financial-health number", on: false },
];
