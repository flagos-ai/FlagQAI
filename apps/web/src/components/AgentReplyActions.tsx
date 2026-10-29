import { useEffect, useRef, useState } from "react";
export function AgentReplyActions({
  markdown,
  question = false,
}: {
  markdown: string;
  question?: boolean;
}) {
  const [result, setResult] = useState<{
    source: string;
    status: "copied" | "error";
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const status = result?.source === markdown ? result.status : "idle";
  const copy = async () => {
    // Use message source, never text extracted from rendered math/HTML.
    const source = markdown;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(source);
      setResult({ source, status: "copied" });
    } catch {
      setResult({ source, status: "error" });
    }
    timer.current = setTimeout(() => setResult(null), 2000);
  };
  if (!markdown.trim()) return null;
  return (
    <>
      <button
        className={
          question
            ? "fq-copy-icon fq-agent-question-copy-button"
            : "fq-copy-icon fq-agent-reply-copy-button"
        }
        type="button"
        onClick={() => void copy()}
        aria-label={question ? "Copy question" : "Copy reply as Markdown"}
        title={
          status === "error"
            ? "Clipboard unavailable. Check your browser's clipboard permission."
            : status === "copied"
              ? "Markdown copied"
              : question
                ? "Copy question as Markdown"
                : "Copy reply as Markdown · includes LaTeX source"
        }
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
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
      <span role="status" className="fq-sr-only">
        {status === "copied"
          ? question
            ? "Question copied"
            : "Original Markdown copied, including LaTeX source"
          : status === "error"
            ? "Cannot copy Markdown. Clipboard access is unavailable."
            : ""}
      </span>
    </>
  );
}
