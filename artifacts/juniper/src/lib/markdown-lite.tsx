// A small, dependency-free renderer for the specific markdown subset the
// draft legal docs (src/content/*.md) use: #/##/### headers, **bold**,
// *italic*, `code`, bullet lists (with indented continuation lines), one
// pipe table, horizontal rules, and paragraphs. Not a general markdown
// parser: it exists so /terms and /privacy don't need a new dependency for
// two static documents.
import type { ReactNode } from "react";

const INLINE_RE = /\[(NEEDS[^\]]*)\]|\*\*(.+?)\*\*|`([^`]+)`|\*([^*]+)\*/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    if (m[1] !== undefined) {
      nodes.push(
        <mark key={key++} className="legal-flag">
          {m[1]}
        </mark>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={key++}>{m[3]}</code>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key++}>{m[4]}</em>);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTableRule(line: string) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim());
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;

  let para: string[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++}>{renderInline(para.join(" ").trim())}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={key++}>
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((r) => !isTableRule(r)).map(splitRow);
      const [head, ...body] = rows;
      blocks.push(
        <table key={key++} className="legal-table">
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i}>{renderInline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{renderInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      table = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      flushList();
      flushTable();
      continue;
    }
    if (trimmed === "---") {
      flushPara();
      flushList();
      flushTable();
      blocks.push(<hr key={key++} />);
      continue;
    }
    if (trimmed.startsWith("|")) {
      flushPara();
      flushList();
      table.push(trimmed);
      continue;
    }
    if (/^#{1,4}\s/.test(trimmed)) {
      flushPara();
      flushList();
      flushTable();
      const level = trimmed.match(/^#+/)![0].length;
      const text = trimmed.replace(/^#{1,4}\s+/, "");
      const Tag = (`h${Math.min(level + 1, 4)}` as unknown) as "h2" | "h3" | "h4";
      blocks.push(<Tag key={key++}>{renderInline(text)}</Tag>);
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      flushPara();
      flushTable();
      list.push(trimmed.replace(/^-\s+/, ""));
      continue;
    }
    if (/^\s/.test(line) && list.length) {
      // Indented continuation of the current bullet.
      list[list.length - 1] = `${list[list.length - 1]} ${trimmed}`;
      continue;
    }
    flushList();
    flushTable();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  flushTable();

  return <>{blocks}</>;
}
