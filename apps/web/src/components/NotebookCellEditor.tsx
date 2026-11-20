import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NotebookAssistance } from "../api/notebook-sessions";
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
  words,
  onAssist,
  onSelection,
  onSplit,
}: {
  source: string;
  label: string;
  python: boolean;
  onChange: (source: string) => void;
  onRun: () => void;
  words: string;
  onAssist: (
    source: string,
    cursor: number,
    kind: "complete" | "inspect",
  ) => Promise<NotebookAssistance>;
  onSelection: (cursor: number) => void;
  onSplit: (cursor: number) => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | undefined>(
    undefined,
  );
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [suggestions, setSuggestions] = useState<{
    values: string[];
    start: number;
    end: number;
    source: string;
    caret: number;
  }>();
  const [selected, setSelected] = useState(0);
  const [help, setHelp] = useState("");
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      sequence.current++;
      clearTimeout(timer.current);
    },
    [],
  );
  async function assist(
    kind: "complete" | "inspect",
    text = source,
    force = true,
  ) {
    const input = editor.current;
    if (!input) return;
    const cursor = input.selectionStart;
    const token = ++sequence.current;
    const prefix = /[A-Za-z_]\w*$/.exec(text.slice(0, cursor))?.[0] || "";
    const local = prefix
      ? Array.from(
          new Set(
            (
              words +
              " def return import from for while if else elif True False None print range len"
            ).match(/[A-Za-z_]\w*/g) || [],
          ),
        )
          .filter((word) => word.startsWith(prefix) && word !== prefix)
          .sort()
          .slice(0, 30)
      : [];
    let result: NotebookAssistance;
    try {
      result = await onAssist(text, cursor, kind);
    } catch {
      result = { available: false };
    }
    if (
      sequence.current !== token ||
      editor.current?.value !== text ||
      editor.current?.selectionStart !== cursor
    )
      return;
    if (kind === "inspect") {
      setSuggestions(undefined);
      setHelp(
        result.documentation?.replace(/\x1b\[[0-9;]*m/g, "") ||
          (result.available
            ? "No parameter information at this cursor."
            : "Run a cell to start the kernel; parameter hints are available while it is idle."),
      );
    } else {
      const values = result.matches?.length ? result.matches : local;
      setSelected(0);
      setSuggestions(
        values.length
          ? {
              values,
              start: result.matches?.length
                ? result.cursor_start!
                : cursor - prefix.length,
              end: result.matches?.length ? result.cursor_end! : cursor,
              source: text,
              caret: cursor,
            }
          : undefined,
      );
      if (force && !values.length)
        setHelp(
          "No completions at this cursor. Run imports first for library completions.",
        );
    }
  }
  function accept(value: string) {
    if (
      !suggestions ||
      suggestions.source !== source ||
      editor.current?.selectionStart !== suggestions.caret
    )
      return;
    const next =
      source.slice(0, suggestions.start) +
      value +
      source.slice(suggestions.end);
    pendingSelection.current = {
      start: suggestions.start + value.length,
      end: suggestions.start + value.length,
    };
    setSuggestions(undefined);
    setHelp("");
    sequence.current++;
    onChange(next);
  }
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
          onSelect={(event) => {
            onSelection(event.currentTarget.selectionStart);
            if (
              suggestions &&
              event.currentTarget.selectionStart !== suggestions.caret
            )
              setSuggestions(undefined);
          }}
          onBlur={() => {
            sequence.current++;
            clearTimeout(timer.current);
            setSuggestions(undefined);
          }}
          onChange={(event) => {
            const text = event.target.value;
            const cursor = event.target.selectionStart;
            sequence.current++;
            setSuggestions(undefined);
            setHelp("");
            clearTimeout(timer.current);
            onChange(text);
            if (
              python &&
              !(event.nativeEvent as InputEvent).isComposing &&
              /[A-Za-z_]\w{1,}$|\.$/.test(text.slice(0, cursor))
            ) {
              timer.current = setTimeout(
                () => void assist("complete", text, false),
                350,
              );
            }
          }}
          onScroll={(event) =>
            setScroll({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            })
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              sequence.current++;
              clearTimeout(timer.current);
              setSuggestions(undefined);
              setHelp("");
              return;
            }
            if (python && event.ctrlKey && event.code === "Space") {
              event.preventDefault();
              clearTimeout(timer.current);
              void assist(event.shiftKey ? "inspect" : "complete");
              return;
            }
            if (
              (event.ctrlKey || event.metaKey) &&
              event.shiftKey &&
              event.code === "Minus"
            ) {
              event.preventDefault();
              onSplit(event.currentTarget.selectionStart);
              return;
            }
            if (
              suggestions &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelected(
                  (value) =>
                    (value +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      suggestions.values.length) %
                    suggestions.values.length,
                );
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                accept(suggestions.values[selected]);
                return;
              }
            }
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
              if (edit.source === source)
                input.setSelectionRange(edit.start, edit.end);
              else {
                pendingSelection.current = edit;
                onChange(edit.source);
              }
            }
          }}
        />
      </div>
      {suggestions && (
        <div
          className="fq-notebook-completions"
          role="listbox"
          aria-label="Code completions"
        >
          {suggestions.values.map((value, index) => (
            <button
              key={value}
              role="option"
              aria-selected={selected === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      {help && (
        <div className="fq-notebook-code-help" role="status">
          <button
            aria-label="Close parameter hints"
            onClick={() => setHelp("")}
          >
            ×
          </button>
          <pre>{help}</pre>
        </div>
      )}
    </>
  );
}
