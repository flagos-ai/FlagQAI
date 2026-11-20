import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { codeTokens } from "../state/code-tokens";
import { indentSelection, isIndentShortcut } from "../state/editor-indent";
import {
  isCommentShortcut,
  toggleLineComments,
} from "../state/editor-comments";

/** Keep native textarea selection/IME behavior and paint matching syntax beneath it. */
export function NotebookCellEditor({
  source,
  label,
  python,
  onChange,
  onRun,
}: {
  source: string;
  label: string;
  python: boolean;
  onChange: (source: string) => void;
  onRun: () => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | undefined>(
    undefined,
  );
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const tokens = useMemo(
    () => codeTokens(source, python ? "python" : "plain"),
    [source, python],
  );
  useLayoutEffect(() => {
    const next = pendingSelection.current;
    if (next && editor.current) {
      editor.current.focus({ preventScroll: true });
      editor.current.setSelectionRange(next.start, next.end);
      pendingSelection.current = undefined;
    }
  }, [source]);
  function replaceSelection(prefix: string, suffix = prefix) {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    const selected = source.slice(start, end) || "text";
    pendingSelection.current = {
      start: start + prefix.length,
      end: start + prefix.length + selected.length,
    };
    onChange(
      source.slice(0, start) + prefix + selected + suffix + source.slice(end),
    );
  }
  return (
    <>
      {!python && (
        <div
          className="fq-notebook-format"
          role="toolbar"
          aria-label="Markdown formatting"
        >
          <button
            title="Bold"
            aria-label="Bold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceSelection("**")}
          >
            <strong>B</strong>
          </button>
          <button
            title="Italic"
            aria-label="Italic"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceSelection("*")}
          >
            <em>I</em>
          </button>
          <button
            title="Heading"
            aria-label="Heading"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceSelection("## ", "")}
          >
            H₂
          </button>
          <button
            title="Inline code"
            aria-label="Inline code"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceSelection("`")}
          >
            〈/〉
          </button>
        </div>
      )}
      <div className={"fq-notebook-source " + (python ? "is-python" : "")}>
        {python && (
          <pre aria-hidden="true">
            <code
              style={{
                transform: `translate(${-scroll.left}px, ${-scroll.top}px)`,
              }}
            >
              {tokens.map((token, index) => (
                <span key={index} className={"fq-token-" + token.kind}>
                  {token.text}
                </span>
              ))}
              {"\n"}
            </code>
          </pre>
        )}
        <textarea
          ref={editor}
          aria-label={label}
          spellCheck={false}
          autoFocus={!python}
          wrap="off"
          value={source}
          rows={Math.min(
            22,
            Math.max(python ? 2 : 3, source.split("\n").length),
          )}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) =>
            setScroll({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            })
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.shiftKey && event.key === "Enter") {
              event.preventDefault();
              onRun();
              return;
            }
            const input = event.currentTarget;
            const shortcut = {
              ...event,
              isComposing: event.nativeEvent.isComposing,
            };
            const comment = python && isCommentShortcut(shortcut);
            if (comment || isIndentShortcut(shortcut)) {
              event.preventDefault();
              const edit = comment
                ? toggleLineComments(
                    source,
                    input.selectionStart,
                    input.selectionEnd,
                    "python",
                  )
                : indentSelection(
                    source,
                    input.selectionStart,
                    input.selectionEnd,
                    event.shiftKey,
                  );
              pendingSelection.current = edit;
              onChange(edit.source);
            }
          }}
        />
      </div>
    </>
  );
}
