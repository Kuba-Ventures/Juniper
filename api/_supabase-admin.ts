// Server-only Supabase access via the service-role key. This BYPASSES RLS, so
// it may only ever be used from server-side Edge functions, never exposed to
// the client. Used for the plaid_items table, which has no client grants (see
// migration 0007). Always scope queries by user_id yourself: because the
// service role bypasses RLS, the per-user filtering is your responsibility here.
import { readEnv } from "./_env";

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

export function adminConfigured(): boolean {
  return !!SUPABASE_URL && !!SERVICE_ROLE_KEY;
}

function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SERVICE_ROLE_KEY!}`,
  };
}

// Fetch against the PostgREST Data API with the service-role key.
// `pathAndQuery` is everything after /rest/v1/ (e.g. "plaid_items?user_id=eq.X").
export async function adminRest(pathAndQuery: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { ...adminHeaders(), ...((init?.headers as Record<string, string>) ?? {}) },
  });
}
