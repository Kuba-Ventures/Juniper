import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "wheel", "scroll", "touchstart"] as const;
const CHECK_INTERVAL_MS = 30_000;

// Signs the member out after `timeoutMs` with no activity. A plain
// setTimeout is not enough on its own: a backgrounded tab's timers are
// throttled by the browser and can fire late (or effectively not at all), so
// idleness is also checked immediately when the tab becomes visible again,
// which is exactly the "stepped away, came back" case this exists for.
export function useIdleLogout(enabled: boolean, timeoutMs: number) {
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const checkIdle = () => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) void supabase.auth.signOut();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkIdle();
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, markActive, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [enabled, timeoutMs]);
}
