// Profile hydration hook, the local + remote source of truth for the member's
// name and financial snapshot. Extracted from the retired `app-shell.tsx` so
// the live shell (`juniper-app.tsx`), the onboarding-complete handler, and the
// finances provider all read/write the profile the same way.
//
// Local (localStorage) hydrates instantly; the remote `user_profiles` row (via
// /api/profile) then overrides when it carries data. Writes go to both. The
// remote table has no column for onboarding `accounts`/`connections` yet, so
// those persist locally only (a known gap, tracked in PROJECT.md).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAccessToken } from "@/lib/supabase";
import {
  loadProfile,
  saveProfile as saveProfileLocal,
  type UserProfile,
} from "@/lib/profile";

export function nameFromEmail(email: string): string {
  if (!email) return "there";
  const first = email.split("@")[0].split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function fetchRemoteProfile(): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function postRemoteProfile(body: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}

export interface UseProfile {
  profile: UserProfile | null;
  displayName: string;
  ready: boolean; // true once the remote hydration attempt has resolved
  saveProfile: (p: UserProfile, name?: string) => void;
  setDisplayName: (n: string) => void;
}

export function useProfile(email: string, metaName?: string): UseProfile {
  const initialName = useMemo(
    () => (metaName?.trim() ? metaName.trim() : nameFromEmail(email)),
    [email, metaName],
  );

  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [ready, setReady] = useState(false);

  useEffect(() => setDisplayName(initialName), [initialName]);

  // Local hydrate as soon as the email is known.
  useEffect(() => {
    if (!email) return;
    setProfileState(loadProfile(email));
  }, [email]);

  // Remote hydrate; a non-empty remote row wins over localStorage.
  useEffect(() => {
    if (!email) return;
    let alive = true;
    fetchRemoteProfile()
      .then((data) => {
        if (!alive || !data) return;
        setProfileState((prev) => {
          const next: UserProfile = {
            ...prev,
            monthlyIncome: (data.monthly_income as number | undefined) ?? prev?.monthlyIncome,
            monthlyExpenses: (data.monthly_expenses as number | undefined) ?? prev?.monthlyExpenses,
            totalSavings: (data.total_savings as number | undefined) ?? prev?.totalSavings,
            totalDebt: (data.total_debt as number | undefined) ?? prev?.totalDebt,
            goals: (data.goals as string[] | undefined) ?? prev?.goals,
            completedAt: (data.updated_at as string | undefined) ?? prev?.completedAt,
          };
          saveProfileLocal(next, email);
          return next;
        });
        if (typeof data.name === "string" && data.name.trim()) setDisplayName(data.name.trim());
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [email]);

  const saveProfile = useCallback(
    (p: UserProfile, name?: string) => {
      saveProfileLocal(p, email);
      setProfileState(p);
      const nextName = name?.trim() || displayName;
      if (nextName && nextName !== displayName) setDisplayName(nextName);
      // Only the financial fields have remote columns; accounts/connections stay local.
      void postRemoteProfile({
        name: nextName,
        monthly_income: p.monthlyIncome ?? null,
        monthly_expenses: p.monthlyExpenses ?? null,
        total_savings: p.totalSavings ?? null,
        total_debt: p.totalDebt ?? null,
        goals: p.goals ?? null,
      });
    },
    [email, displayName],
  );

  return { profile, displayName, ready, saveProfile, setDisplayName };
}
