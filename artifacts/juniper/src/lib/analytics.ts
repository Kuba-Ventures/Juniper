// Google Analytics 4 (gtag.js).
// ------------------------------------------------------------------
// Loaded only in production builds (import.meta.env.PROD) so local dev
// traffic never hits the property. Page views — including SPA route
// changes — are captured by GA4 Enhanced Measurement (enabled on the
// data stream), so we only send *custom* events (e.g. sign_up) here.
//
// Measurement ID lives in the "Juniper Web" property (account: Juniper).

const GA_MEASUREMENT_ID = "G-C6W0BFQ3ZG";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let loaded = false;

/** Inject gtag.js and start the session. Safe to call more than once. */
export function initAnalytics(): void {
  if (loaded || !import.meta.env.PROD || typeof window === "undefined") return;
  loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
}

// Custom events that also count as a *meaningful* engaged action (WAU signal).
// When one of these fires, it's routed through the engaged-session guard so we
// don't have to sprinkle trackEngagement() at every click site — the existing
// click handlers keep calling trackEvent() unchanged. `sign_up` is NOT here:
// it happens on the anonymous marketing page, not signed-in product usage.
const ENGAGING_EVENTS = new Set(["affiliate_click", "resource_click"]);

/** Send a custom GA4 event. No-ops outside production. */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!import.meta.env.PROD || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
  // Outbound clicks are meaningful actions; mark the session engaged (once).
  if (ENGAGING_EVENTS.has(name)) {
    trackEngagement(name, { plan_domain: params.plan_domain });
  }
}

/**
 * Bind a stable identity to GA4 so the same user is deduped across devices and
 * sessions (this is what makes the WAU = distinct user_id count meaningful).
 * Call once the authed Supabase session resolves; never for anon/marketing
 * pages. No-ops outside production.
 */
export function setAnalyticsUser(userId: string): void {
  if (!import.meta.env.PROD || typeof window === "undefined" || !window.gtag) return;
  window.gtag("set", { user_id: userId });
}

// One engaged_session per browser session. Reset only on a full reload (module
// re-eval), which matches how GA4 scopes a session for WAU purposes.
let hasEngagedThisSession = false;

/**
 * Weekly-active-user signal. Fires a single canonical `engaged_session` event
 * on the FIRST meaningful action of the session (guarded by the module-level
 * flag); later actions in the same session are no-ops. The granular action
 * that triggered engagement is passed as the `action` param. No-ops outside
 * production. Meaningful = anything beyond loading a page: creating/advancing a
 * plan, editing a plan field, sending a plan-chat message, clicking an outbound
 * link, toggling a connection.
 */
export function trackEngagement(action: string, params: Record<string, unknown> = {}): void {
  if (!import.meta.env.PROD || typeof window === "undefined" || !window.gtag) return;
  if (hasEngagedThisSession) return;
  hasEngagedThisSession = true;
  window.gtag("event", "engaged_session", { action, ...params });
}
