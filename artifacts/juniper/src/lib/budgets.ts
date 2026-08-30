import { getAccessToken } from "@/lib/supabase";

// Client for /api/budgets, the member's monthly category limits.
//
// The endpoint has done full CRUD since Stage 3d and nothing called it, so a
// budget could only ever reach the database by hand. This module is the missing
// half; the Budgets panel on Transactions is its only caller.
//
// A limit is stored against a LABEL, and the label this app writes is always a
// spending GROUP (see SPEND_GROUPS). /api/finances resolves a group-labelled
// budget against the whole group and a leaf-labelled one against just that
// category, so leaf budgets still read correctly if they were ever written by
// something else; nothing here creates one.
//
// Writes do not return the new rollup: /api/finances owns spent-against-limit,
// so a caller saves, then calls the finances context's `refresh()` to let the
// figures catch up from the one place that computes them.

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// Upsert. The endpoint keys on (user, category, monthly), so saving over an
// existing limit is the same call as creating one and there is no edit path to
// get wrong.
export async function saveBudget(category: string, limit: number): Promise<boolean> {
  try {
    const res = await authedFetch("/api/budgets", {
      method: "POST",
      body: JSON.stringify({ category, limit }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeBudget(category: string): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/budgets?category=${encodeURIComponent(category)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}
