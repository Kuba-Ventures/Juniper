// The HTML served for /invite/partner/:token, so the link says who sent it.
//
// ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
//
// A link preview is built by a crawler (Apple's, WhatsApp's, Slack's) that
// fetches the URL and reads the HTML. IT DOES NOT RUN JAVASCRIPT. Juniper is a
// Vite SPA behind one static index.html, and vercel.json rewrites every
// non-asset route to that same file, so an invite link previewed as the
// marketing card ("Juniper: build your financial future, together", over a
// watercolour house) and nothing a React page did could change it. Issue #172.
//
// So this function stands in front of that one route: it resolves the token to
// the inviter's first name, takes the BUILT index.html and swaps six tags in it,
// and hands the result to whoever asked, crawler or person. No user-agent
// sniffing anywhere: the human gets the same HTML and their SPA boots from it
// exactly as before.
//
// Treatment B of three, rendered in design/partner-invite-preview-variants.html.
// The image stays static (design/invite-og-card.html, rendered to
// public/invite-og.png) and the NAME is what changes, because the name is the
// bold line a reader actually reads in a message bubble and because a static
// image needs no per-request rendering.
//
// ── WHY IT FETCHES ITS OWN index.html RATHER THAN HOLDING A COPY ───────────
//
// A copy of the shell in this file would be a second, stale index.html: it would
// miss the pre-paint theme script, the font preconnects, and above all the
// hashed bundle filename, which changes on every deploy. So the built file is
// the source and this only edits it. /index.html carries a dot, which the
// catch-all rewrite excludes, so fetching it cannot loop back into this
// function.
import { lookupInvite } from "./_invite-lookup";

export const config = { runtime: "edge" };

/** Long enough for any real first name, short enough that a pathological one
 *  cannot push the sentence out of a preview card. */
const NAME_MAX = 24;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replace one meta tag's content, keyed on `property=` or `name=`.
 *  Returns the html unchanged when the tag is not there, which the caller
 *  checks: a silent no-op here is how this feature would stop working after an
 *  unrelated edit to index.html, with the only symptom a preview quietly going
 *  back to the marketing card. */
function setMeta(html: string, attr: "property" | "name", key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  return html.replace(re, `$1${esc(value)}$2`);
}

function setTitle(html: string, value: string): string {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(value)}</title>`);
}

/** The last resort, when the origin cannot serve its own shell. The crawler
 *  still gets the right preview, and a PERSON still gets somewhere useful that
 *  carries the token: /auth/sign-up?partner=… is the same handoff the invite
 *  page itself makes, and it works signed out. */
function bareFallback(token: string, title: string, desc: string, image: string): string {
  const q = encodeURIComponent(token);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:40px">
<h1 style="font-size:20px">${esc(title)}</h1>
<p><a href="/auth/sign-up?partner=${q}">Accept your invitation</a></p>
</body></html>`;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  const found = await lookupInvite(token);
  const name = (found.inviter || "").slice(0, NAME_MAX);

  // A spent or unknown token still gets the invitation wording rather than the
  // marketing card: the person clicking it was invited, whatever the state of
  // the row, and the page behind this explains anything that is wrong with it.
  const title = name
    ? `${name} invited you to plan money together on Juniper`
    : "You have been invited to plan money together on Juniper";
  const desc = name
    ? `${name} is using Juniper to plan their money and wants to plan yours together. Nothing of yours is shared until you choose it, account by account, and your transactions are never shared.`
    : "Somebody is using Juniper to plan their money and wants to plan yours together. Nothing of yours is shared until you choose it, account by account, and your transactions are never shared.";
  const image = `${url.origin}/invite-og.png`;

  let shell: string | null = null;
  for (const path of ["/index.html", "/"]) {
    try {
      const res = await fetch(new URL(path, url.origin), { headers: { "x-juniper-shell": "1" } });
      if (res.ok) {
        const text = await res.text();
        if (text.includes("<title>")) { shell = text; break; }
      }
    } catch {
      /* try the next one, then fall back below */
    }
  }

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    // Cached at the edge on the URL, which already includes the token, so one
    // invite's preview can never be served for another. Short, because the
    // answer changes the moment the invite is accepted.
    "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
  };

  if (!shell) {
    console.warn("[invite-preview] could not fetch the app shell; serving the bare fallback");
    return new Response(bareFallback(token, title, desc, image), { headers });
  }

  let html = setTitle(shell, title);
  html = setMeta(html, "name", "description", desc);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", desc);
  html = setMeta(html, "property", "og:image", image);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", desc);
  html = setMeta(html, "name", "twitter:image", image);

  // Loud rather than silent: if the shell's tags have been renamed or reformatted
  // the swap does nothing and every invite quietly previews as the marketing
  // card again, which is the exact bug this function was written to fix.
  if (!html.includes(`content="${esc(title)}"`)) {
    console.warn("[invite-preview] og:title was not replaced; check the meta tags in index.html");
  }

  return new Response(html, { headers });
}
