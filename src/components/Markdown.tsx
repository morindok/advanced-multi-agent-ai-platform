import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    const k = `${keyBase}-m${i++}`;
    if (tok.startsWith("`")) nodes.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**") || tok.startsWith("__")) nodes.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      nodes.push(
        mm ? (
          <a key={k} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>
        ) : (
          <Fragment key={k}>{tok}</Fragment>
        ),
      );
    } else nodes.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyBase}-end`}>{text.slice(last)}</Fragment>);
  return nodes;
}

/** رندرکننده‌ی markdown سبک و امن (بدون dangerouslySetInnerHTML) */
export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // بلوک کد
    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        <pre key={key++} data-lang={lang}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    // جدول
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <table key={key++}>
          <thead>
            <tr>{head.map((h, idx) => <th key={idx}>{inline(h, `th${key}${idx}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${key}${ri}${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    // عنوان
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = (`h${Math.min(level, 4)}`) as "h1" | "h2" | "h3" | "h4";
      out.push(<Tag key={key++}>{inline(h[2], `h${key}`)}</Tag>);
      i++;
      continue;
    }
    // خط جدا
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }
    // نقل قول
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key++}>{inline(buf.join(" "), `bq${key}`)}</blockquote>);
      continue;
    }
    // فهرست
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={key++}>
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `li${key}${idx}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    // پاراگراف
    if (line.trim()) {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|>|\||[-*+]\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(<p key={key++}>{inline(buf.join("\n"), `p${key}`)}</p>);
      continue;
    }
    i++;
  }

  return <div className={`md ${className}`}>{out}</div>;
}
