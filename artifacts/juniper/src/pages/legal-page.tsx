// Shared shell for /terms and /privacy. Renders a `docs/*.md` source
// (mirrored into src/content/*.md, see that directory's note).
//
// The draft ribbon and the doc's own "(DRAFT, NOT FOR PUBLICATION)" framing
// were removed 2026-09-09 at Finley's explicit direction after asking him to
// confirm: he chose to strip draft language everywhere, understanding that
// ~15 inline [NEEDS LAWYER INPUT: ...] placeholders (arbitration clause,
// liability caps, age threshold, data retention, etc., see PROJECT.md issue
// #283) still sit in the body, now with no framing explaining what they are.
// Those are left untouched on purpose: filling them in requires an actual
// legal decision, not a guess.
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

      <article className="legal-doc">
        <MarkdownLite source={source} />
      </article>

      <div className="legal-footer">
        <Link href={sibling.href}>{sibling.label}</Link> · <a href="mailto:hello@juniperplan.com">hello@juniperplan.com</a>
      </div>
    </div>
  );
}
