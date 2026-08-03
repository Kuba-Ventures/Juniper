import { Route, Switch } from "wouter";
import { useSession } from "@/lib/use-session";
import { WorkspaceProvider } from "@/lib/workspace";
import { AppBar } from "@/components/juniper/app-frame";
import Home from "@/pages/app/home";
import { Recommended } from "@/pages/app/recommended";
import { Credit } from "@/pages/app/credit";
import { Spending } from "@/pages/app/spending";
import { Score } from "@/pages/app/score";
import { Admin } from "@/pages/app/admin";
import Plans from "@/pages/app/plans";
import Ask from "@/pages/app/ask";
import { SharedOverview } from "@/pages/app/shared/overview";
import { SharedAccounts } from "@/pages/app/shared/accounts";
import { SharedGoals } from "@/pages/app/shared/goals";
import { SharedBills } from "@/pages/app/shared/bills";
import { SharedActivity } from "@/pages/app/shared/activity";
import { SharedSharing } from "@/pages/app/shared/sharing";
import "@/styles/juniper.css";

function displayName(email: string, metaName?: string) {
  if (metaName?.trim()) return metaName.trim();
  if (!email) return "there";
  const first = email.split("@")[0].split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export default function JuniperApp() {
  const session = useSession();
  const email = session?.user.email?.toLowerCase() ?? "";
  const metaName = (session?.user.user_metadata as { name?: string } | undefined)?.name;
  const name = displayName(email, metaName);

  return (
    <WorkspaceProvider>
      <div className="jnpr">
        <AppBar name={name} email={email} />
        <Switch>
          <Route path="/app">{() => <Home name={name} />}</Route>
          <Route path="/app/spending" component={Spending} />
          <Route path="/app/score" component={Score} />
          <Route path="/app/admin" component={Admin} />
          <Route path="/app/plans" component={Plans} />
          <Route path="/app/ask" component={Ask} />
          <Route path="/app/credit" component={Credit} />
          <Route path="/app/recommended" component={Recommended} />
          <Route path="/app/shared" component={SharedOverview} />
          <Route path="/app/shared/accounts" component={SharedAccounts} />
          <Route path="/app/shared/goals" component={SharedGoals} />
          <Route path="/app/shared/bills" component={SharedBills} />
          <Route path="/app/shared/activity" component={SharedActivity} />
          <Route path="/app/shared/sharing" component={SharedSharing} />
          <Route>
            <div className="frame">
              <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Page not found.</div>
            </div>
          </Route>
        </Switch>
      </div>
    </WorkspaceProvider>
  );
}
