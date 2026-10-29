import { useMemo, useState } from "react";
import { lineDiff } from "../state/code-diff";
import { codeTokens } from "../state/code-tokens";
import type { SourceLanguage } from "../contracts/quantum-workspace";
export function CodeDiff({
  before,
  after,
  language,
}: {
  before: string;
  after: string;
  language: SourceLanguage;
}) {
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState(1000);
  const rows = useMemo(() => lineDiff(before, after), [before, after]);
  const visible = new Set<number>();
  rows.forEach((row, index) => {
    if (all || row.kind !== "equal")
      for (
        let i = Math.max(0, index - 3);
        i <= Math.min(rows.length - 1, index + 3);
        i++
      )
        visible.add(i);
  });
  const added = rows.filter((row) => row.kind === "added").length,
    removed = rows.filter((row) => row.kind === "removed").length;
  let skipped = 0,
    rendered = 0;
  const totalVisible = visible.size;
  return (
    <section className="fq-code-diff" aria-label="Agent code diff">
      <div className="fq-diff-heading">
        <span>Before → Agent</span>
        <span className="added">+{added}</span>
        <span className="removed">−{removed}</span>
        <button onClick={() => setAll(!all)}>
          {all ? "Changes only" : "Show unchanged lines"}
        </button>
      </div>
      {!added && !removed ? (
        <p>No code differences.</p>
      ) : (
        <div
          className="fq-diff-lines"
          role="region"
          aria-label="Changed code lines"
          tabIndex={0}
        >
          {rows.map((row, index) => {
            if (!visible.has(index)) {
              skipped++;
              if (index < rows.length - 1 && !visible.has(index + 1))
                return null;
              const count = skipped;
              skipped = 0;
              return (
                <div key={index} className="fq-diff-fold">
                  ⋯ {count} unchanged lines
                </div>
              );
            }
            if (++rendered > limit) return null;
            return (
              <div key={index} className={"fq-diff-row " + row.kind}>
                <span className="fq-diff-number">{row.oldLine ?? ""}</span>
                <span className="fq-diff-number">{row.newLine ?? ""}</span>
                <span className="fq-diff-sign">
                  {row.kind === "added"
                    ? "+"
                    : row.kind === "removed"
                      ? "−"
                      : " "}
                </span>
                <code>
                  {codeTokens(row.text || " ", language).map((token, i) => (
                    <span key={i} className={"fq-token-" + token.kind}>
                      {token.text}
                    </span>
                  ))}
                </code>
              </div>
            );
          })}
          {totalVisible > limit && (
            <button
              className="fq-diff-more"
              onClick={() => setLimit(limit + 1000)}
            >
              Show next {Math.min(1000, totalVisible - limit)} diff lines
            </button>
          )}
        </div>
      )}
    </section>
  );
}
