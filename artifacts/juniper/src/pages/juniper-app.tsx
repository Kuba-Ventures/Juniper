import { Route, Switch } from "wouter";
import { useSession } from "@/lib/use-session";
import { AppBar } from "@/components/juniper/app-frame";
import Home from "@/pages/app/home";
import { Recommended } from "@/pages/app/recommended";
import { Credit } from "@/pages/app/credit";
import { Spending } from "@/pages/app/spending";
import Plans from "@/pages/app/plans";
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
    <div className="jnpr">
      <AppBar name={name} />
      <Switch>
        <Route path="/app">{() => <Home name={name} />}</Route>
        <Route path="/app/spending" component={Spending} />
        <Route path="/app/plans" component={Plans} />
        <Route path="/app/credit" component={Credit} />
        <Route path="/app/recommended" component={Recommended} />
        <Route>
          <div className="frame">
            <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 40 }}>Page not found.</div>
          </div>
        </Route>
      </Switch>
    </div>
  );
}
