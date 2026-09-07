// Profile hydration hook, the local + remote source of truth for the member's
// name and financial snapshot. Extracted from the retired `app-shell.tsx` so
// the live shell (`juniper-app.tsx`), the onboarding-complete handler, and the
// finances provider all read/write the profile the same way.
//
// Local (localStorage) hydrates instantly; the remote `user_profiles` row (via
// /api/profile) then overrides when it carries data. Writes go to both. The
// remote table has no column for onboarding `accounts`/`connections` yet, so
// those persist locally only (a known gap, tracked in PROJECT.md).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase";
import {
  loadProfile,
  saveProfile as saveProfileLocal,
  type UserProfile,
} from "@/lib/profile";
import { asHolderStyle } from "@/lib/holder-style";
import { asDashboardLayout, PERSONAL_REGISTRY, SHARED_REGISTRY } from "@/lib/dashboard-layout";
import { invalidateHousehold } from "@/lib/household";

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

// Returns whether the write actually persisted, so a caller that cares (an
// explicit rename) can tell a real save from one that silently vanished into
// a dropped request or a server error, rather than the two being
// indistinguishable the way they used to be.
async function postRemoteProfile(body: Record<string, unknown>): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface UseProfile {
  profile: UserProfile | null;
  displayName: string;
  ready: boolean; // true once the remote hydration attempt has resolved
  /** Resolves to whether the write actually persisted. Every other field here
   *  is best-effort (a failed layout or holder-style save just tries again
   *  next time), but a rename is the one field where the caller (Settings)
   *  needs to know a failure happened so it can tell the member rather than
   *  showing a name that was never actually saved. */
  saveProfile: (p: UserProfile, name?: string) => Promise<boolean>;
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
  // Tracked outside saveProfile's own deps so a rename that fails can restore
  // whatever name was showing before the attempt, without reintroducing the
  // bug this hook already carries a scar from: saveProfile deliberately does
  // NOT depend on displayName, because resending it as `name` on every
  // unrelated save is exactly how "there" got written to the server in the
  // first place. This ref is read-only from saveProfile's perspective, for
  // rollback alone, never sent anywhere.
  const displayNameRef = useRef(displayName);

  useEffect(() => setDisplayName(initialName), [initialName]);
  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

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
            // Narrowed rather than cast: the column is CHECKed (0048), but a
            // client should not trust a constraint in a database it cannot see,
            // and this value ends up in a class name.
            holderStyle: asHolderStyle(data.holder_style) ?? prev?.holderStyle,
            // Narrowed for the same reason, and with more at stake: 0049's CHECK
            // constrains the shape but deliberately not the widget ids, since
            // they are the app's registry and a closed list there would mean a
            // migration before every new card. So the client is the only thing
            // that can drop an id it does not know.
            dashboardLayout: asDashboardLayout(data.dashboard_layout, PERSONAL_REGISTRY) ?? prev?.dashboardLayout,
            // Same narrowing, same reasoning, the shared board's own registry:
            // migration 0060's CHECK constrains the shape only, not the ids.
            sharedDashboardLayout: asDashboardLayout(data.shared_dashboard_layout, SHARED_REGISTRY) ?? prev?.sharedDashboardLayout,
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
    (p: UserProfile, name?: string): Promise<boolean> => {
      saveProfileLocal(p, email);
      setProfileState(p);
      const trimmedName = name?.trim();
      const previousName = displayNameRef.current;
      if (trimmedName) setDisplayName(trimmedName);
      // The financial fields and the holder choice have remote columns;
      // accounts/connections stay local. `name` is sent only on an explicit
      // edit: every other caller (layout, holder style, ...) calls this with
      // no `name` argument, and resending the CURRENT displayName here would
      // let a save unrelated to the member's name silently overwrite the
      // stored one with whatever displayName happened to be at that moment
      // (e.g. still the "there" placeholder before remote hydration resolves).
      // The server PATCH only touches fields present in the body, so omitting
      // `name` leaves the stored value alone.
      const promise = postRemoteProfile({
        ...(trimmedName ? { name: trimmedName } : {}),
        monthly_income: p.monthlyIncome ?? null,
        monthly_expenses: p.monthlyExpenses ?? null,
        total_savings: p.totalSavings ?? null,
        total_debt: p.totalDebt ?? null,
        goals: p.goals ?? null,
        // Null, not omitted, so clearing a choice actually clears it. `?? null`
        // rather than `|| null` because "" is not a value this field can hold.
        holder_style: p.holderStyle ?? null,
        dashboard_layout: p.dashboardLayout ?? null,
        shared_dashboard_layout: p.sharedDashboardLayout ?? null,
      });
      if (trimmedName) {
        void promise.then((ok) => {
          if (ok) {
            invalidateHousehold();
          } else {
            // The rename never reached the server (dropped request, expired
            // session, a 500): restore whatever name was showing before this
            // attempt rather than leaving the UI claiming one that was never
            // actually persisted. The caller (Settings) surfaces the failure
            // from this same promise so the member knows to retry.
            setDisplayName(previousName);
          }
        });
      }
      return promise;
    },
    [email],
  );

  return { profile, displayName, ready, saveProfile, setDisplayName };
}
