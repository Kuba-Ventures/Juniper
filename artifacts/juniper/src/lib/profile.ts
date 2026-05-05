export type UserProfile = {
  monthlyIncome?: number;
  monthlyExpenses?: number;
  totalSavings?: number;
  totalDebt?: number;
  goals?: string[];
  completedAt?: string;
};

const PROFILE_KEY = "juniper_profile";

export function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({ ...profile, completedAt: new Date().toISOString() }),
  );
}

export function formatProfileContext(p: UserProfile): string {
  const lines: string[] = [];
  if (p.monthlyIncome) lines.push(`- Monthly take-home income: $${p.monthlyIncome.toLocaleString()}`);
  if (p.monthlyExpenses) lines.push(`- Monthly essential expenses: $${p.monthlyExpenses.toLocaleString()}`);
  if (p.totalSavings !== undefined) lines.push(`- Total savings: $${p.totalSavings.toLocaleString()}`);
  if (p.totalDebt !== undefined) lines.push(`- Total debt: $${p.totalDebt.toLocaleString()}`);
  if (p.goals && p.goals.length > 0) lines.push(`- Financial goals: ${p.goals.join(", ")}`);
  if (lines.length === 0) return "";
  return `\nThe user has provided the following financial profile. Use it as background context — don't repeat it back unless relevant, but let it inform your responses:\n${lines.join("\n")}`;
}
