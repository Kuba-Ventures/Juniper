// The notifications bell (issue #266): three facts the app already computes
// server-side and had nowhere to surface. No new table, no stored read state —
// each item is derived live from data already fetched for other pages, which
// is deliberately the smaller of the two moves the issue lays out. Read state
// and a proper notifications table are the harder follow-up it names, not this.
import { useEffect, useMemo, useState } from "react";
import { useFinances } from "@/lib/finances";
import { fetchSubscriptions } from "@/lib/subscriptions";
import { money } from "@/lib/mock-data";

export type NotificationKind = "reconnect" | "budget" | "drift";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
}

function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function useNotifications(): { items: NotificationItem[]; loading: boolean } {
  const { data, sync, source } = useFinances();
  // Subscriptions isn't part of the /api/finances payload AppBar already reads
  // (see src/lib/subscriptions.ts), so the drift check costs its own fetch.
  const [drift, setDrift] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    if (source !== "live") {
      setDrift([]);
      return;
    }
    let cancelled = false;
    fetchSubscriptions().then((payload) => {
      if (cancelled || !payload) return;
      setDrift(
        payload.items
          .filter((s) => s.health === "amount_changed")
          .map((s) => ({
            id: `drift-${s.id}`,
            kind: "drift" as const,
            title: `${s.name} charged more than expected`,
            detail:
              s.expected != null && s.last != null
                ? `Expected ${money(s.expected)}, charged ${money(s.last)}`
                : "The amount changed from what you confirmed",
            href: "/app/transactions",
          })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return useMemo(() => {
    const reconnect: NotificationItem[] = (sync?.needsRelink ?? []).map((r, i) => ({
      id: `reconnect-${r.institution}-${i}`,
      kind: "reconnect",
      title: `${r.institution} needs reconnecting`,
      detail: r.since ? `Balances stopped updating ${sinceLabel(r.since)}` : "Balances have stopped updating",
      href: "/app/connections",
    }));
    const budget: NotificationItem[] = (data.budgets ?? [])
      .filter((b) => b.l > 0 && b.s > b.l)
      .map((b) => ({
        id: `budget-${b.c}`,
        kind: "budget",
        title: `${b.c} is over budget`,
        detail: `${money(b.s)} of ${money(b.l)} this month`,
        href: "/app/transactions?panel=budgets",
      }));
    return {
      items: [...reconnect, ...budget, ...(drift ?? [])],
      loading: source === "live" && drift === null,
    };
  }, [sync, data.budgets, drift, source]);
}
