import { UIIcon } from "./UIIcon";
import { useEffect, useId, useRef, useState } from "react";
import { codeTokens, codeTokenLines } from "../state/code-tokens";
export function CodeExample({
  title,
  code,
  language,
  actions,
  highlightLine,
  lineNumbers = false,
}: {
  title: string;
  code: string;
  language: "python" | "qasm" | "plain";
  actions?: React.ReactNode;
  highlightLine?: number;
  lineNumbers?: boolean;
}) {
  const id = useId(),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [copying, setCopying] = useState(false);
  const copyLock = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const pre = useRef<HTMLPreElement>(null);
  const tokens = codeTokens(code, language);
  const lines =
    lineNumbers || (Number.isInteger(highlightLine) && highlightLine! > 0)
      ? codeTokenLines(tokens)
      : [];
  const numbered =
    lineNumbers ||
    (Number.isInteger(highlightLine) &&
      highlightLine! > 0 &&
      highlightLine! <= lines.length);
  useEffect(() => {
    if (!numbered) return;
    // Wait until the parent dialog has opened; scroll only this code pane.
    const timer = setTimeout(() => {
      const panel = pre.current;
      const target = panel?.querySelector<HTMLElement>(
        '[data-highlighted="true"]',
      );
      if (!panel || !target) return;
      panel.scrollTop +=
        target.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        (panel.clientHeight - target.getBoundingClientRect().height) / 2;
    }, 0);
    return () => clearTimeout(timer);
  }, [code, highlightLine, numbered]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    generation.current++;
    clearTimeout(timer.current);
    setStatus("idle");
    return () => {
      generation.current++;
    };
  }, [code, title]);
  const copy = async () => {
    if (copyLock.current) return;
    copyLock.current = true;
    setCopying(true);
    const version = generation.current;
    clearTimeout(timer.current);
    setStatus("idle");
    try {
      await navigator.clipboard.writeText(code);
      if (alive.current && generation.current === version) setStatus("copied");
    } catch {
      if (alive.current && generation.current === version) setStatus("error");
    } finally {
      copyLock.current = false;
      if (alive.current) setCopying(false);
      if (alive.current && generation.current === version)
        timer.current = setTimeout(() => setStatus("idle"), 2500);
    }
  };
  return (
    <section className="fq-code-example" aria-labelledby={id}>
      <div className="fq-code-heading">
        <h3 id={id}>{title}</h3>
        <div className="fq-code-actions">
          {actions}
          <button
            className="fq-copy-icon fq-code-copy"
            type="button"
            onClick={() => void copy()}
            disabled={copying}
            aria-busy={copying}
            aria-label={"Copy " + title}
            title={
              copying
                ? "Copying…"
                : status === "copied"
                  ? "Copied to clipboard"
                  : "Copy " + title
            }
          >
            <UIIcon
              name={copying ? "clock" : status === "copied" ? "check" : "copy"}
              size={14}
            />
          </button>
        </div>
      </div>
      <pre
        ref={pre}
        className={numbered ? "fq-code-numbered" : undefined}
        aria-label={title + " code"}
      >
        <code>
          {numbered
            ? lines.map((line, index) => (
                <span
                  key={index}
                  className="fq-code-line"
                  data-line={index + 1}
                  data-highlighted={
                    index + 1 === highlightLine ? "true" : undefined
                  }
                  aria-label={
                    index + 1 === highlightLine
                      ? `Line ${index + 1}, error location`
                      : undefined
                  }
                >
                  {line.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      className={"fq-syntax-" + token.kind}
                    >
                      {token.text}
                    </span>
                  ))}
                </span>
              ))
            : tokens.map((token, index) => (
                <span key={index} className={"fq-syntax-" + token.kind}>
                  {token.text}
                </span>
              ))}
        </code>
      </pre>
      <span
        role="status"
        className={status === "error" ? "fq-copy-error" : "fq-sr-only"}
      >
        {copying
          ? "Copying…"
          : status === "copied"
            ? "Copied to clipboard"
            : status === "error"
              ? "Copy unavailable. Select the code to copy manually."
              : ""}
      </span>
    </section>
  );
}
