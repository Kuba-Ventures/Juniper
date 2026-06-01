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

/** Send a custom GA4 event. No-ops outside production. */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!import.meta.env.PROD || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}
