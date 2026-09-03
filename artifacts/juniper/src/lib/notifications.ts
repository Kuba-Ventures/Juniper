// The notifications bell (issue #266). Two things happen here:
//
// 1. WHICH FACTS ARE TRUE RIGHT NOW is still computed live, unchanged from
//    the first pass: a connection that needs reconnecting (sync.needsRelink),
//    a budget over its limit this month (data.budgets), a subscription charge
//    that drifted from what the member confirmed (fetchSubscriptions()'s
//    health check). This module is the one place that decides what counts,
//    and api/notifications.ts deliberately never re-derives it, so there is
//    exactly one definition rather than two free to disagree.
// 2. THE HISTORY BEHIND THEM now has real storage. Every computed fact
//    carries a `dedupeKey` naming its own instance (which connection failure,
//    which month's budget, which charge), sent to /api/notifications on every
//    load; the server reconciles it into rows with a status
//    (active/resolved/cleared) and a read flag. See that file's header for
//    why a cleared row stays cleared instead of being deleted.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useFinances } from "@/lib/finances";
import { fetchSubscriptions } from "@/lib/subscriptions";
import { money } from "@/lib/mock-data";
import { getAccessToken } from "@/lib/supabase";

export type NotificationKind = "reconnect" | "budget" | "drift";

interface Fact {
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  detail: string;
  href: string;
}

// The server's own shape (api/notifications.ts's `list`/`reconcile`).
export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  status: "active" | "resolved" | "cleared";
  created_at: string;
  resolved_at: string | null;
  read_at: string | null;
}

// Short relative-time labels for the bell's rows ("2h", "3w", "4mo"), distinct
// from `sinceLabel` below, which is prose for a reconnect fact's own detail line.
export function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

// The live facts, unchanged in substance from the first pass, now each
// carrying the key that names their own instance (see the module header).
function liveFacts(
  sync: { needsRelink: { institution: string; since: string | null }[] } | undefined,
  budgets: { c: string; s: number; l: number }[],
  subs: { id: string; name: string; health: string | null; expected: number | null; last: number | null; lastDate: string | null }[] | null,
): Fact[] {
  const period = new Date().toISOString().slice(0, 7); // budgets are always the current month
  const reconnect: Fact[] = (sync?.needsRelink ?? []).map((r) => ({
    kind: "reconnect",
    dedupeKey: `reconnect:${r.institution}:${r.since ?? "unknown"}`,
    title: `${r.institution} needs reconnecting`,
    detail: r.since ? `Balances stopped updating ${sinceLabel(r.since)}` : "Balances have stopped updating",
    href: "/app/connections",
  }));
  const budget: Fact[] = budgets
    .filter((b) => b.l > 0 && b.s > b.l)
    .map((b) => ({
      kind: "budget",
      dedupeKey: `budget:${b.c}:${period}`,
      title: `${b.c} is over budget`,
      detail: `${money(b.s)} of ${money(b.l)} this month`,
      href: "/app/transactions?panel=budgets",
    }));
  const drift: Fact[] = (subs ?? [])
    .filter((s) => s.health === "amount_changed")
    .map((s) => {
      // health === "amount_changed" fires on a 5%/$1 deviation in EITHER
      // direction (api/subscriptions.ts's AMOUNT_TOLERANCE/AMOUNT_FLOOR), not
      // only an increase, so the title has to say which one actually happened
      // rather than assume the more common case.
      const known = s.expected != null && s.last != null;
      const lower = known && s.last! < s.expected!;
      return {
        kind: "drift" as const,
        dedupeKey: `drift:${s.id}:${s.lastDate ?? s.last ?? "unknown"}`,
        title: `${s.name} charged ${lower ? "less" : "more"} than expected`,
        detail: known
          ? `Expected ${money(s.expected!)}, charged ${money(s.last!)}`
          : "The amount changed from what you confirmed",
        href: "/app/transactions",
      };
    });
  return [...reconnect, ...budget, ...drift];
}

export function useNotifications(): {
  loading: boolean;
  /** Active and unread: what a member opening the bell needs to act on. */
  active: NotificationRecord[];
  /** Read-but-active, and resolved: everything else still worth keeping around. */
  earlier: NotificationRecord[];
  markRead: (id: string) => void;
  clear: (id: string) => void;
} {
  const { data, sync, source } = useFinances();
  const [subs, setSubs] = useState<Awaited<ReturnType<typeof fetchSubscriptions>>>(null);
  // Separate from `subs` itself: fetchSubscriptions() resolves to null on a
  // genuine failure too, so "loaded, no data" has to be distinguishable from
  // "still loading" or a failed subscriptions fetch would block reconnect and
  // budget facts, which do not depend on it, from ever reconciling.
  const [subsLoaded, setSubsLoaded] = useState(false);
  const [records, setRecords] = useState<NotificationRecord[] | null>(null);

  useEffect(() => {
    if (source !== "live") {
      setSubsLoaded(true);
      return;
    }
    let cancelled = false;
    fetchSubscriptions().then((payload) => {
      if (cancelled) return;
      setSubs(payload);
      setSubsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const factsKey = useMemo(() => {
    if (source !== "live") return null;
    return JSON.stringify(liveFacts(sync, data.budgets ?? [], subs?.items ?? null));
  }, [source, sync, data.budgets, subs]);

  useEffect(() => {
    if (!factsKey || !subsLoaded) return;
    let cancelled = false;
    authed("/api/notifications", { method: "POST", body: JSON.stringify({ active: JSON.parse(factsKey) }) })
      .then((res) => (res?.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setRecords((payload as { items: NotificationRecord[] }).items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [factsKey, subsLoaded]);

  const markRead = useCallback((id: string) => {
    setRecords((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)) : prev));
    void authed("/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) });
  }, []);

  const clear = useCallback((id: string) => {
    setRecords((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    void authed(`/api/notifications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }, []);

  return useMemo(() => {
    const items = records ?? [];
    return {
      loading: source === "live" && records === null,
      active: items.filter((r) => r.status === "active" && !r.read_at),
      earlier: items.filter((r) => r.status !== "active" || !!r.read_at),
      markRead,
      clear,
    };
  }, [records, source, markRead, clear]);
}
