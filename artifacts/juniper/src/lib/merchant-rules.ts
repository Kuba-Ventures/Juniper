import { getAccessToken } from "@/lib/supabase";

// Client for /api/merchant-rules, "always categorize this merchant as this
// category".
//
// A rule is offered at the one moment it makes sense: just after a member has
// corrected a charge by hand, when they are looking at the merchant they would
// have to correct again next month. Asked anywhere else it is a settings
// screen nobody opens.

export interface MerchantRule {
  merchant: string;
  category: string;
  category_id: string | null;
  created_at: string;
}

async function authed(input: string, init?: RequestInit) {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false as const, error: "You are signed out. Reload and try again." };
    const res = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false as const, error: body.error || "That did not save. Try again." };
    return { ok: true as const, data: body as Record<string, unknown> };
  } catch {
    return { ok: false as const, error: "That did not save. Try again." };
  }
}

/** Make a rule, and apply it to the charges already there. The reply's
 *  `applied` is how many existing charges moved, or null when the rule saved
 *  but the backfill could not be read: the rule still catches the next sync. */
export async function createMerchantRule(merchant: string, category: string) {
  return authed("/api/merchant-rules", { method: "POST", body: JSON.stringify({ merchant, category }) });
}

export async function fetchMerchantRules(): Promise<MerchantRule[]> {
  const r = await authed("/api/merchant-rules");
  return r.ok ? ((r.data.rules as MerchantRule[]) ?? []) : [];
}

/** Stops the rule applying to new charges. It does NOT undo the ones it set:
 *  Plaid's original classification is not kept, so there is nothing honest to
 *  revert them to. */
export async function deleteMerchantRule(merchant: string) {
  return authed(`/api/merchant-rules?merchant=${encodeURIComponent(merchant)}`, { method: "DELETE" });
}
