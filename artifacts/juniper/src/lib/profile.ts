export type UserProfile = {
  monthlyIncome?: number;
  monthlyExpenses?: number;
  totalSavings?: number;
  totalDebt?: number;
  goals?: string[];
  // Lightweight "accounts I use" list (partner names). Local-only for now; the
  // remote user_profiles table has no column for it yet.
  connections?: string[];
  completedAt?: string;
};

function profileKey(email?: string) {
  return email ? `juniper_profile_${email}` : "juniper_profile";
}

function onboardedKey(email?: string) {
  return email ? `juniper_onboarded_${email}` : "juniper_onboarded";
}

// Whether the user has finished (or dismissed) first-run onboarding. Cleared
// by the testing reset so onboarding re-triggers.
export function isOnboarded(email?: string): boolean {
  try {
    return localStorage.getItem(onboardedKey(email)) === "1";
  } catch {
    return false;
  }
}
export function markOnboarded(email?: string): void {
  try {
    localStorage.setItem(onboardedKey(email), "1");
  } catch {
    /* ignore */
  }
}
export function clearOnboarded(email?: string): void {
  try {
    localStorage.removeItem(onboardedKey(email));
  } catch {
    /* ignore */
  }
}

// True if the profile already carries meaningful financial data (so an
// existing user isn't shown onboarding).
export function hasProfileData(p: UserProfile | null): boolean {
  if (!p) return false;
  return (
    typeof p.monthlyIncome === "number" ||
    typeof p.monthlyExpenses === "number" ||
    typeof p.totalSavings === "number" ||
    typeof p.totalDebt === "number"
  );
}

export function loadProfile(email?: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(email));
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile, email?: string): void {
  localStorage.setItem(
    profileKey(email),
    JSON.stringify({ ...profile, completedAt: new Date().toISOString() }),
  );
}

// Testing helper: remove the cached profile from localStorage.
export function clearProfile(email?: string): void {
  try {
    localStorage.removeItem(profileKey(email));
  } catch {
    /* ignore */
  }
}

// Testing helper: delete the server-side profile row. Imports getAccessToken
// lazily so this module stays free of a hard supabase dependency.
export async function deleteRemoteProfile(): Promise<boolean> {
  try {
    const { getAccessToken } = await import("./supabase");
    const token = await getAccessToken();
    const res = await fetch("/api/profile", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return res.ok;
  } catch {
    return false;
  }
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
