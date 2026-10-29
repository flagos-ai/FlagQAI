import { useEffect, useState } from "react";
import { sourceRevision } from "../state/code-diff";
import type { SourceLanguage } from "../contracts/quantum-workspace";
export function SourceVersion({
  source,
  language = "qasm",
  currentSource,
  currentLanguage = "qasm",
  compact = false,
  label = "Source",
}: {
  source: string;
  language?: SourceLanguage;
  currentSource?: string;
  currentLanguage?: SourceLanguage;
  compact?: boolean;
  label?: string;
}) {
  const [revision, setRevision] = useState<{ source: string; hash: string }>();
  useEffect(() => {
    let active = true;
    void sourceRevision(source)
      .then((hash) => {
        if (active) setRevision({ source, hash });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [source]);
  const hash = revision?.source === source ? revision.hash : undefined;
  const matches = currentSource === source && currentLanguage === language;
  return (
    <span
      className={
        "fq-source-version " +
        (compact ? "compact" : matches ? "current" : "snapshot")
      }
      title={hash ? `SHA-256: ${hash}` : "Calculating source revision"}
    >
      {compact
        ? ""
        : `${label} · ${language === "python" ? "Python" : "OpenQASM"} `}
      <code>{hash ? hash.slice(0, 8) : "…"}</code>
      {!compact && currentSource !== undefined && (
        <span>{matches ? "Matches editor" : "Differs from editor"}</span>
      )}
    </span>
  );
}
