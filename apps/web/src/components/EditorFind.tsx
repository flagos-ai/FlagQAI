import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import { findCodeMatches, type CodeMatch } from "../state/editor-find";

export function EditorFind({
  source,
  seed,
  anchor: initialAnchor,
  sequence,
  onMatch,
  onReveal,
  onClose,
}: {
  source: string;
  seed: string;
  anchor: number;
  sequence: number;
  onMatch: (source: string, match?: CodeMatch) => void;
  onReveal: (start: number, length: number) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(seed);
  const [matchCase, setMatchCase] = useState(false);
  const [anchor, setAnchor] = useState(initialAnchor);
  const matches = useMemo(
    () => findCodeMatches(source, query, matchCase),
    [source, query, matchCase],
  );
  const found = matches.findIndex((match) => match.start >= anchor);
  const index = found < 0 ? 0 : found;
  const match = matches[index];
  useLayoutEffect(() => {
    if (seed) setQuery(seed);
    setAnchor(initialAnchor);
    input.current?.focus();
    input.current?.select();
  }, [sequence]);
  useLayoutEffect(() => {
    onMatch(source, match);
    // Updating source while typing in the editor must not move its caret.
    if (match && input.current?.parentElement?.contains(document.activeElement))
      onReveal(match.start, match.end - match.start);
  }, [source, query, matchCase, match?.start, match?.end]);
  const move = (direction: number) => {
    const next = matches[(index + direction + matches.length) % matches.length];
    if (!next) return;
    setAnchor(next.start);
    onReveal(next.start, next.end - next.start);
  };
  return (
    <div className="fq-editor-find" role="group" aria-label="Find in code">
      <input
        ref={input}
        aria-label="Find in current code"
        placeholder="Find in current file"
        maxLength={256}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setAnchor(initialAnchor);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            if (event.key === "Escape") event.stopPropagation();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "f"
          ) {
            event.preventDefault();
            input.current?.select();
          }
        }}
      />
      <span role="status" aria-label="Code search matches">
        {!query
          ? "Enter text"
          : matches.length
            ? `${index + 1} of ${matches.length}`
            : "No matches"}
      </span>
      <button
        aria-label="Match case"
        title="Match case"
        aria-pressed={matchCase}
        onClick={() => setMatchCase(!matchCase)}
      >
        Aa
      </button>
      <button
        aria-label="Previous code match"
        title="Previous match (Shift+Enter)"
        disabled={!matches.length}
        onClick={() => move(-1)}
      >
        ↑
      </button>
      <button
        aria-label="Next code match"
        title="Next match (Enter)"
        disabled={!matches.length}
        onClick={() => move(1)}
      >
        ↓
      </button>
      <CloseButton label="Close code search" onClick={onClose} />
    </div>
  );
}
