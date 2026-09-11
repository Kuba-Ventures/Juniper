import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in your .env.local."
  );
}

// Purge any session a prior build left in localStorage. The session lived
// there before this change, which meant closing the tab or the browser never
// signed anyone out; a stale token sitting in localStorage would otherwise
// survive this switch to sessionStorage untouched.
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith("sb-") && key.endsWith("-auth-token")) localStorage.removeItem(key);
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    // sessionStorage rather than localStorage: closing the tab or the browser
    // ends the session, so the next visit requires signing in again. Each tab
    // gets its own session as a consequence (sessionStorage is per-tab), which
    // is the accepted tradeoff for a session that isn't permanent by default.
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
