import { useCallback, useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { useSession } from "@/lib/use-session";
import { useProfile } from "@/lib/use-profile";
import { FinancesProvider } from "@/lib/finances";
import { AppBar } from "@/components/juniper/app-frame";
import { FirstRunOnboarding } from "@/components/onboarding/first-run-onboarding";
import { isOnboarded, markOnboarded, hasProfileData, type UserProfile } from "@/lib/profile";
import Overview from "@/pages/app/overview";
import Transactions from "@/pages/app/transactions";
import { Credit } from "@/pages/app/credit";
import { Score } from "@/pages/app/score";
import { Admin } from "@/pages/app/admin";
import Plans from "@/pages/app/plans";
import Ask from "@/pages/app/ask";
import { ConnectionsView } from "@/pages/connections";
import "@/styles/juniper.css";

// Two surfaces are deliberately absent from this Switch (Stage 4c). Only the
// member's own real data may render anywhere in Juniper, and neither could
// satisfy that:
//
//   /app/recommended            src/pages/app/recommended.tsx
//   /app/shared, +5 sub-pages   src/pages/app/shared/*.tsx
//
// The files, the endpoints (/api/partners, /api/recommendations, /api/partner*),
// and the tables all stay. Nothing links to either one, so a member who types
// the URL falls through to the not-found route at the bottom of this Switch.
//
// What has to be true before either is routed again is written where the code
// is: recommended.tsx's header for the marketplace, and
// components/juniper/shared-frame.tsx's header for all six shared pages.
// Restoring is re-adding the import and the <Route>, plus, for the shared
// workspace, re-wrapping this tree in WorkspaceProvider. That provider is
// removed here because with the switcher gone nothing consumed it, and leaving
// it mounted kept writing jnpr.workspace.v1 and polling /api/partner on every
// app load for a surface no one can reach.

const welcomedKey = (email: string) => `juniper_welcomed_${email}`;
function isWelcomed(email: string): boolean {
  try {
    return !email || localStorage.getItem(welcomedKey(email)) === "1";
  } catch {
    return true;
  }
}
function markWelcomed(email: string): void {
  try {
    if (email) localStorage.setItem(welcomedKey(email), "1");
  } catch {
    /* ignore */
  }
}

function LoadingShell() {
  return (
    <div className="jnpr" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--jnpr-ink-3)", fontSize: 14 }}>
      Loading…
    </div>
  );
}

export default function JuniperApp() {
  const session = useSession();
  const email = session?.user.email?.toLowerCase() ?? "";
  const metaName = (session?.user.user_metadata as { name?: string } | undefined)?.name;
  const { profile, displayName, ready, saveProfile } = useProfile(email, metaName);

  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const handleOnboardingComplete = useCallback(
    (p: UserProfile, name: string) => {
      setOnboardingDone(true);
      markOnboarded(email);
      saveProfile(p, name);
      setShowWelcome(true); // greet them on the freshly built dashboard
    },
    [email, saveProfile],
  );

  // Show the one-time welcome tip for returning users who haven't seen it.
  useEffect(() => {
    if (email && !isWelcomed(email)) setShowWelcome(true);
  }, [email]);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    markWelcomed(email);
  }, [email]);

  const onboarded = isOnboarded(email);

  // Avoid flashing onboarding at a returning user whose profile lives only on
  // the server: wait for the remote hydration attempt before deciding.
  if (email && !onboarded && !onboardingDone && !ready) return <LoadingShell />;

  const needsOnboarding = !!email && !onboardingDone && !onboarded && !hasProfileData(profile);
  if (needsOnboarding) {
    return (
      <FirstRunOnboarding
        email={email}
        initialName={displayName}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <FinancesProvider profile={profile}>
      <div className="jnpr">
        <AppBar name={displayName} email={email} />
        <Switch>
          <Route path="/app">
            {() => (
              <Overview
                name={displayName}
                showWelcome={showWelcome}
                onDismissWelcome={dismissWelcome}
              />
            )}
          </Route>
          <Route path="/app/transactions" component={Transactions} />
          <Route path="/app/score" component={Score} />
          <Route path="/app/admin" component={Admin} />
          {/* Plans reads the profile's signup goals to offer the ones with no
              plan yet, so it gets this component's already-hydrated profile
              rather than calling useProfile() a second time. `ready` travels
              with it: the goals section needs to know the remote attempt has
              resolved before deciding a goal is missing. */}
          <Route path="/app/plans">
            {() => <Plans profile={profile} profileReady={ready} />}
          </Route>
          <Route path="/app/ask" component={Ask} />
          <Route path="/app/credit" component={Credit} />
          <Route path="/app/connections" component={ConnectionsView} />
          <Route>
            <div className="frame">
              <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Page not found.</div>
            </div>
          </Route>
        </Switch>
      </div>
    </FinancesProvider>
  );
}
