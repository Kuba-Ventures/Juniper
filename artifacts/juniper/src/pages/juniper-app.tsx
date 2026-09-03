import { useCallback, useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { useSession } from "@/lib/use-session";
import { useProfile } from "@/lib/use-profile";
import { FinancesProvider } from "@/lib/finances";
import { WorkspaceProvider } from "@/lib/workspace";
import { AppBar } from "@/components/juniper/app-frame";
import { FirstRunOnboarding } from "@/components/onboarding/first-run-onboarding";
import { isOnboarded, markOnboarded, shouldShowOnboarding, takeOnboardingReplay, type UserProfile } from "@/lib/profile";
import Overview from "@/pages/app/overview";
import Transactions from "@/pages/app/transactions";
import { Credit } from "@/pages/app/credit";
import { Score } from "@/pages/app/score";
import { Admin } from "@/pages/app/admin";
import Plans from "@/pages/app/plans";
import Ask from "@/pages/app/ask";
import { ConnectionsView } from "@/pages/connections";
import { Settings } from "@/pages/app/settings";
import { SharedOverview } from "@/pages/app/shared/overview";
import { SharedGoals } from "@/pages/app/shared/goals";
import { SharedAccounts } from "@/pages/app/shared/accounts";
import { SharedBills } from "@/pages/app/shared/bills";
import { SharedActivity } from "@/pages/app/shared/activity";
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
// Stage 4d restored the shared half of that: WorkspaceProvider is mounted again
// and /app/shared plus /app/shared/goals are routed, because those two can now
// show the member's own data and say so plainly when there is none. The other
// four shared pages and the marketplace stay exactly as described above.

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
  // Read once, on mount, because reading it consumes it. A developer who starts
  // the replay and then reloads halfway through lands on their dashboard, which
  // is the right end to a flow they walked away from.
  const [replay] = useState(() => takeOnboardingReplay());

  // Avoid flashing onboarding at a returning user whose profile lives only on
  // the server: wait for the remote hydration attempt before deciding.
  if (email && !replay && !onboarded && !onboardingDone && !ready) return <LoadingShell />;

  const needsOnboarding = shouldShowOnboarding({ email, replay, onboarded, onboardingDone, profile });
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
      <WorkspaceProvider>
      <div className="jnpr">
        <AppBar name={displayName} email={email} />
        <Switch>
          <Route path="/app">
            {() => (
              <Overview
                name={displayName}
                // The goals picked at signup, so the "Your plans" card can list
                // the ones that are not plans yet instead of claiming there is
                // nothing. Passed rather than re-read: the profile is already
                // resolved here, and a second useProfile would flash empty.
                goals={Array.isArray(profile?.goals) ? profile.goals : []}
                goalsReady={ready}
                showWelcome={showWelcome}
                onDismissWelcome={dismissWelcome}
                // How this member arranged their Overview (migration 0049),
                // saved through the same profile path holder_style takes, so it
                // lands in localStorage and in `user_profiles` together and
                // travels with the member rather than with this browser.
                // Spread over the CURRENT profile rather than a fresh object:
                // saving a layout must not blank somebody's income.
                layout={profile?.dashboardLayout ?? null}
                onLayout={(next) => saveProfile({ ...(profile ?? {}), dashboardLayout: next })}
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
          {/* The holder style is a member preference (migration 0048), so it is
              threaded from here where the profile already lives rather than
              given its own provider. One prop is cheaper than a context for a
              value exactly one page reads. */}
          <Route path="/app/credit">
            {() => <Credit holderStyle={profile?.holderStyle ?? null} />}
          </Route>
          <Route path="/app/connections" component={ConnectionsView} />
          {/* Same reasoning as Credit above: the holder style is threaded from
              here rather than re-read, and this is also where the profile's
              write path (saveProfile) already lives. Routed rather than a
              modal (issue #245) so /app/settings/appearance is a real,
              deep-linkable destination, e.g. from the Credit page's holder. */}
          <Route path="/app/settings/:tab?">
            {(params) => (
              <Settings
                tab={params.tab}
                name={displayName}
                email={email}
                holderStyle={profile?.holderStyle ?? null}
                onHolderStyle={(s) => saveProfile({ ...(profile ?? {}), holderStyle: s })}
                onNameChange={(n) => saveProfile({ ...(profile ?? {}) }, n)}
              />
            )}
          </Route>
          {/* Stage 4d: two of the six shared surfaces are routed again, the two
              that can show the member's own real data or an honest empty state.
              Accounts, Bills, Activity and Sharing stay unrouted under the
              conditions in components/juniper/shared-frame.tsx. Both of these
              handle "no partnership yet" themselves rather than being hidden,
              so a typed URL lands somewhere that explains itself. */}
          <Route path="/app/shared" component={SharedOverview} />
          <Route path="/app/shared/goals" component={SharedGoals} />
          <Route path="/app/shared/accounts" component={SharedAccounts} />
          <Route path="/app/shared/bills" component={SharedBills} />
          <Route path="/app/shared/activity" component={SharedActivity} />
          <Route>
            <div className="frame">
              <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Page not found.</div>
            </div>
          </Route>
        </Switch>
      </div>
      </WorkspaceProvider>
    </FinancesProvider>
  );
}
