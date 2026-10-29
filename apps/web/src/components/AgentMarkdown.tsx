import { createElement, memo, useMemo, type ReactNode } from "react";
import { type Token, type Tokens } from "marked";
import { mathMarkdown, type MathToken } from "../state/markdown-math";
import { AgentMath } from "./AgentMath";
import { CodeExample } from "./CodeExample";

export function safeMarkdownLink(href: string): string | undefined {
  // Render links as data, never executable protocols or embedded HTML.
  try {
    const target = new URL(href);
    return ["https:", "http:", "mailto:"].includes(target.protocol)
      ? target.href
      : undefined;
  } catch {
    return href.startsWith("#") ? href : undefined;
  }
}
function render(tokens: Token[], depth = 0): ReactNode {
  if (depth > 40) return tokens.map((t) => t.raw).join("");
  const nested = (tokens: Token[] | undefined, fallback = "") =>
    tokens ? render(tokens, depth + 1) : fallback;
  return tokens.map((token, index) => {
    const key = index;
    switch (token.type) {
      case "fqMath":
      case "fqMathBlock": {
        const math = token as MathToken;
        const formula = (
          <AgentMath
            tex={math.text}
            raw={math.raw}
            display={math.display}
            pending={math.pending}
          />
        );
        return math.type === "fqMathBlock" ? (
          <div key={key} className="fq-math-block">
            {formula}
          </div>
        ) : (
          <span key={key}>{formula}</span>
        );
      }
      case "space":
        return null;
      case "heading": {
        const t = token as Tokens.Heading;
        return createElement("h" + t.depth, { key }, nested(t.tokens, t.text));
      }
      case "paragraph": {
        const t = token as Tokens.Paragraph;
        return <p key={key}>{nested(t.tokens, t.text)}</p>;
      }
      case "text": {
        const t = token as Tokens.Text;
        return <span key={key}>{nested(t.tokens, t.text)}</span>;
      }
      case "strong":
      case "em":
      case "del": {
        const t = token as Tokens.Strong;
        return createElement(
          token.type === "strong"
            ? "strong"
            : token.type === "em"
              ? "em"
              : "del",
          { key },
          nested(t.tokens, t.text),
        );
      }
      case "codespan":
        return <code key={key}>{(token as Tokens.Codespan).text}</code>;
      case "br":
        return <br key={key} />;
      case "hr":
        return <hr key={key} />;
      case "escape":
        return <span key={key}>{(token as Tokens.Escape).text}</span>;
      case "blockquote":
        return (
          <blockquote key={key}>
            {nested((token as Tokens.Blockquote).tokens)}
          </blockquote>
        );
      case "list": {
        const list = token as Tokens.List;
        const items = list.items.map((item, i) => (
          <li key={i}>
            {item.task && (
              <input
                type="checkbox"
                disabled
                checked={!!item.checked}
                aria-label={item.checked ? "Completed task" : "Incomplete task"}
              />
            )}{" "}
            {nested(item.tokens, item.text)}
          </li>
        ));
        return list.ordered ? (
          <ol key={key} start={Number(list.start) || 1}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
      case "code": {
        const code = token as Tokens.Code;
        const lang = (code.lang || "text").split(/\s/)[0];
        if (lang === "math")
          return (
            <div key={key} className="fq-math-block">
              <AgentMath tex={code.text} raw={code.text} display />
            </div>
          );
        return (
          <CodeExample
            key={key}
            title={
              /^(sh|bash|zsh)$/i.test(lang)
                ? "Shell"
                : lang === "text"
                  ? "Code"
                  : lang
            }
            language={
              /^(py|python)$/i.test(lang)
                ? "python"
                : /^(qasm|openqasm)$/i.test(lang)
                  ? "qasm"
                  : "plain"
            }
            code={code.text}
          />
        );
      }
      case "link": {
        const link = token as Tokens.Link,
          href = safeMarkdownLink(link.href);
        return href ? (
          <a
            key={key}
            href={href}
            title={link.title || undefined}
            target={href.startsWith("#") ? undefined : "_blank"}
            rel="noopener noreferrer"
          >
            {nested(link.tokens, link.text)}
          </a>
        ) : (
          <span key={key}>{nested(link.tokens, link.text)}</span>
        );
      }
      case "image":
        return (
          <span key={key} className="fq-agent-image-alt">
            [Image: {(token as Tokens.Image).text}]
          </span>
        );
      case "table": {
        const table = token as Tokens.Table;
        return (
          <div key={key} className="fq-agent-table">
            <table>
              <thead>
                <tr>
                  {table.header.map((cell, i) => (
                    <th
                      key={i}
                      style={{ textAlign: table.align[i] || undefined }}
                    >
                      {nested(cell.tokens, cell.text)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        style={{ textAlign: table.align[j] || undefined }}
                      >
                        {nested(cell.tokens, cell.text)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <span key={key}>{token.raw}</span>;
    }
  });
}
// Tokenize once per changed message. Raw model HTML is never mounted.
export const AgentMarkdown = memo(function AgentMarkdown({
  text,
}: {
  text: string;
}) {
  const tokens = useMemo(() => mathMarkdown.lexer(text), [text]);
  return <div className="fq-agent-markdown">{render(tokens)}</div>;
});
