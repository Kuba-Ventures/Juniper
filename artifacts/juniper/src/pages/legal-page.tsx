// Shared shell for /terms and /privacy. Renders a draft `docs/*.md` source
// (mirrored into src/content/*.md, see that directory's note) with a fixed,
// always-visible draft ribbon that does not depend on the markdown parser
// picking up the doc's own status line correctly: the one thing this page
// must never do is read as a finished, in-effect policy.
import { Link } from "wouter";
import { MarkdownLite } from "@/lib/markdown-lite";
import "@/styles/legal.css";

export function LegalPage({
  title,
  source,
  sibling,
}: {
  title: string;
  source: string;
  sibling: { label: string; href: string };
}) {
  return (
    <div className="legal-shell">
      <div className="legal-band">
        <div className="legal-band-inner">
          <Link href="/" className="legal-back">
            ← Juniper
          </Link>
          <h1>{title}</h1>
        </div>
      </div>

      <div className="legal-ribbon">
        <strong>Draft, first pass.</strong> Not reviewed by a lawyer and not in effect. This page
        exists so the link works rather than 404s; see the status note below for the full context.
      </div>

      <article className="legal-doc">
        <MarkdownLite source={source} />
      </article>

      <div className="legal-footer">
        <Link href={sibling.href}>{sibling.label}</Link> · <a href="mailto:hello@juniperplan.com">hello@juniperplan.com</a>
      </div>
    </div>
  );
}
