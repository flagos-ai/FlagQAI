import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { notebookExamples } from "../state/notebooks";
import { UIIcon } from "./UIIcon";
import { synthesisFiles } from "../state/synthesis-files";

export function NotebookPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = useMemo(() => {
    const examples = notebookExamples.map((item) => ({
      ...item,
      label:
        item.title.toLowerCase() === "overview"
          ? item.path.split("/").at(-2)!.replaceAll("_", " ")
          : item.title,
    }));
    let source;
    if (value.startsWith("import:")) {
      try {
        const file = synthesisFiles.find(
          (file) =>
            file.notebookId &&
            localStorage.getItem(
              `fq-synthesis-notebook-v1:${file.path}:${file.sha256}`,
            ) === value.slice(7),
        );
        source = examples.find((item) => item.id === file?.notebookId);
      } catch {
        /* The document remains available without its source label. */
      }
    }
    return value.startsWith("import:")
      ? [
          {
            id: value,
            title: source?.title || "Imported notebook",
            label: source?.label || "Imported notebook",
            path: source
              ? source.path + "/walkthrough.ipynb"
              : "Local editable copy",
            category: "Local",
            unavailableReason: "",
          },
          ...examples,
        ]
      : examples;
  }, [value]);
  const current = items.find((item) => item.id === value);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter((item) =>
    terms.every((term) =>
      `${item.label} ${item.title} ${item.path}`.toLowerCase().includes(term),
    ),
  );
  const groups = Array.from(new Set(matches.map((item) => item.category)));
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const show = () => {
    setQuery("");
    setActive(
      Math.max(
        0,
        items.findIndex((item) => item.id === value && !item.unavailableReason),
      ),
    );
    setOpen(true);
  };
  const choose = (index: number) => {
    const item = matches[index];
    if (!item || item.unavailableReason) return;
    close();
    onChange(item.id);
  };
  useLayoutEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    if (open)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="fq-notebook-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="fq-notebook-picker-trigger"
        aria-label="Notebook example"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        data-notebook-id={value}
        title={
          current ? `${current.label}\n${current.path}` : "Choose notebook"
        }
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <UIIcon name="book" size={14} />
        <span>{current?.label || "Choose notebook"}</span>
        <span className="fq-notebook-picker-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <div
          id={`${id}-panel`}
          className="fq-notebook-picker-panel"
          role="dialog"
          aria-label="Choose notebook"
        >
          <div className="fq-notebook-picker-search">
            <UIIcon name="search" size={14} />
            <input
              ref={input}
              role="combobox"
              aria-label="Search notebooks"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={
                matches[active] ? `${id}-option-${active}` : undefined
              }
              placeholder="Search by title or path…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const available = matches
                    .map((item, index) => (item.unavailableReason ? -1 : index))
                    .filter((index) => index >= 0);
                  if (available.length) {
                    const next =
                      available.indexOf(active) +
                      (event.key === "ArrowDown" ? 1 : -1);
                    setActive(
                      available[(next + available.length) % available.length],
                    );
                  }
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!event.repeat) choose(active);
                }
              }}
            />
          </div>
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Notebooks"
            className="fq-notebook-picker-list"
          >
            {groups.map((group) => (
              <div
                key={group}
                role="group"
                aria-label={group.replaceAll("_", " ")}
              >
                <div className="fq-notebook-picker-category" aria-hidden="true">
                  {group.replaceAll("_", " ")}
                </div>
                {matches.map((item, index) =>
                  item.category !== group ? null : (
                    <button
                      key={item.id}
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={item.id === value}
                      aria-disabled={!!item.unavailableReason}
                      aria-label={item.label}
                      data-index={index}
                      data-notebook-id={item.id}
                      data-active={index === active}
                      tabIndex={-1}
                      title={item.unavailableReason || item.path}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(index)}
                    >
                      <span className="fq-notebook-picker-copy">
                        <strong>{item.label}</strong>
                        <small>{item.path}</small>
                        {item.unavailableReason && (
                          <small>{item.unavailableReason}</small>
                        )}
                      </span>
                      {item.id === value && <UIIcon name="check" size={14} />}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
          {!matches.length && (
            <p className="fq-notebook-picker-empty">No matching notebooks.</p>
          )}
          <footer>
            <span role="status">
              {matches.length} {matches.length === 1 ? "notebook" : "notebooks"}
            </span>
            <span>↑ ↓ · Enter · Esc</span>
          </footer>
        </div>
      )}
    </div>
  );
}
