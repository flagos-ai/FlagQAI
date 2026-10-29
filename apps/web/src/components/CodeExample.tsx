import { useEffect, useId, useRef, useState } from "react";
import { codeTokens } from "../state/code-tokens";
export function CodeExample({
  title,
  code,
  language,
  actions,
}: {
  title: string;
  code: string;
  language: "python" | "qasm" | "plain";
  actions?: React.ReactNode;
}) {
  const id = useId(),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2500);
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
            aria-label={"Copy " + title}
            title={
              status === "copied" ? "Copied to clipboard" : "Copy " + title
            }
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              {status === "copied" ? (
                <path d="m3 8 3 3 7-8" />
              ) : (
                <>
                  <rect x="5" y="5" width="8" height="9" rx="1.5" />
                  <path d="M10 3V2H2v9h1" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
      <pre aria-label={title + " code"}>
        <code>
          {codeTokens(code, language).map((token, index) => (
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
        {status === "copied"
          ? "Copied to clipboard"
          : status === "error"
            ? "Copy unavailable. Select the code to copy manually."
            : ""}
      </span>
    </section>
  );
}
