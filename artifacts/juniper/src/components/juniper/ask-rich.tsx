// Very light **bold** + paragraph rendering for a planner reply, enough for
// both the standalone /app/ask page and the app-bar panel (#263) — shared
// so a reply cannot render differently in one than the other.
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} style={{ margin: i ? "10px 0 0" : 0 }}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
            p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
          )}
        </p>
      ))}
    </>
  );
}
