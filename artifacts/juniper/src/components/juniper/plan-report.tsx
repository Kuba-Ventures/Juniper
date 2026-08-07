import type { PlanReport } from "@/lib/planner";

// A polished, printable plan. "Download PDF" uses the browser's print-to-PDF
// (no dependency, works everywhere); print CSS in juniper.css isolates .rp-sheet
// so the saved PDF is just the plan, cleanly formatted.
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function PlanReportView({ report, planTitle, onClose }: { report: PlanReport; planTitle?: string; onClose: () => void }) {
  return (
    <div className="rp-overlay" role="dialog" aria-modal="true">
      <div className="rp-bar">
        <button className="btn ghost sm" onClick={onClose}>← Back to chat</button>
        <span className="rp-bar-t">Plan ready</span>
        <button className="btn sm" onClick={() => window.print()}>Download PDF</button>
      </div>

      <div className="rp-scroll">
        <article className="rp-sheet">
          <header className="rp-head">
            <div className="rp-brand"><img src="/logo.png" alt="Juniper" /><span>Juniper</span></div>
            <div className="rp-meta">{planTitle ? `${planTitle} · ` : ""}{fmtDate(report.generatedAt)}</div>
          </header>

          <h1 className="rp-title">{report.title}</h1>
          <p className="rp-headline">{report.headline}</p>

          <section className="rp-sec">
            <h2>Where you stand</h2>
            <p>{report.situation}</p>
          </section>

          <section className="rp-sec">
            <h2>The plan</h2>
            <p>{report.recommendation}</p>
          </section>

          <section className="rp-sec">
            <h2>Your steps</h2>
            <ol className="rp-steps">
              {report.steps.map((s, i) => (
                <li key={i}>
                  <div className="rp-step-h">
                    <span className="rp-step-t">{s.title}</span>
                    {(s.amount || s.timeline) && (
                      <span className="rp-step-tags">
                        {s.amount && <span className="rp-tag amt">{s.amount}</span>}
                        {s.timeline && <span className="rp-tag">{s.timeline}</span>}
                      </span>
                    )}
                  </div>
                  <p className="rp-step-d">{s.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          {report.assumptions && report.assumptions.length > 0 && (
            <section className="rp-sec">
              <h2>Assumptions</h2>
              <ul className="rp-assume">
                {report.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </section>
          )}

          <footer className="rp-foot">
            Prepared by Juniper on {fmtDate(report.generatedAt)}. This is educational guidance to help you plan, not licensed financial, tax, or legal advice. Confirm big moves with a qualified professional.
          </footer>
        </article>
      </div>
    </div>
  );
}
