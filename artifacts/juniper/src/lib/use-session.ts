import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAnalyticsUser } from "@/lib/analytics";

export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Bind GA4 to the authed identity as soon as a session resolves, so WAU
    // dedupes the same user across devices/sessions. This hook only runs behind
    // authed surfaces, so anon/marketing pages never set a user_id.
    const bind = (s: Session | null) => {
      if (s?.user.id) setAnalyticsUser(s.user.id);
    };
    supabase.auth.getSession().then(({ data }) => {
      bind(data.session);
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      bind(s);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}
