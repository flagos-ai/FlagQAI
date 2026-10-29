import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToString } from "katex";
import { mathCopyPosition, type CopyRect } from "../state/math-copy-position";
export const AgentMath = memo(function AgentMath({
  tex,
  raw,
  display = false,
  pending = false,
}: {
  tex: string;
  raw: string;
  display?: boolean;
  pending?: boolean;
}) {
  const html = useMemo(() => {
    if (pending || tex.length > 4096) return null;
    try {
      return renderToString(tex, {
        displayMode: display,
        output: "htmlAndMathml",
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxExpand: 200,
        maxSize: 8,
        macros: {},
      });
    } catch {
      return null;
    }
  }, [tex, display, pending]);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setStatus("idle");
  }, [tex]);
  const copy = async () => {
    if (pending) return;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(tex);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    timer.current = setTimeout(() => setStatus("idle"), 1800);
  };
  const wrapper = useRef<HTMLSpanElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const reveal = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (pending || !wrapper.current) return;
    const root =
      wrapper.current.closest(".fq-agent-thread") ||
      wrapper.current.closest(".fq-agent-markdown");
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const pinned = root
      .closest(".fq-agent-transcript-shell")
      ?.querySelector(".fq-agent-pinned-question")
      ?.getBoundingClientRect();
    const viewport = {
      left: Math.max(4, bounds.left + 4),
      top: Math.max(4, bounds.top + 4, pinned ? pinned.bottom + 4 : 0),
      right: Math.min(window.innerWidth - 4, bounds.right - 4),
      bottom: Math.min(window.innerHeight - 4, bounds.bottom - 4),
    };
    const ink = (element: Element) => {
      const bases = element.querySelectorAll(
        ".katex-html > .katex-base, .katex-html > .base, .katex-html > .katex-tag, .katex-html > .tag",
      );
      return [...(bases.length ? bases : [element])]
        .flatMap((base) => [...base.getClientRects()])
        .filter((rect) => rect.width > 0 && rect.height > 0);
    };
    const parts = ink(wrapper.current);
    const anchor = {
      left: Math.max(viewport.left, Math.min(...parts.map((r) => r.left))),
      top: Math.max(viewport.top, Math.min(...parts.map((r) => r.top))),
      right: Math.min(viewport.right, Math.max(...parts.map((r) => r.right))),
      bottom: Math.min(
        viewport.bottom,
        Math.max(...parts.map((r) => r.bottom)),
      ),
    };
    const obstacles: CopyRect[] = [
      ...root.querySelectorAll(".fq-math-copy"),
    ].flatMap(ink);
    // Also avoid surrounding prose, headings and result labels where possible.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null,
      count = 0;
    while ((node = walker.nextNode()) && count++ < 1500) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest(".fq-math-copy, .fq-sr-only")
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      obstacles.push(...range.getClientRects());
    }
    setPosition(
      mathCopyPosition(anchor, viewport, obstacles) ?? {
        // A fully dense transcript still has a non-circuit header above it.
        left: Math.min(window.innerWidth - 30, bounds.right - 30),
        top: Math.max(4, bounds.top - 29),
      },
    );
  }, [pending]);
  const hide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (document.activeElement !== action.current) setPosition(null);
    }, 180);
  };
  useEffect(() => {
    if (!position) return;
    const moved = () => {
      if (document.activeElement === action.current) reveal();
      else setPosition(null);
    };
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      clearTimeout(hideTimer.current);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [!!position, reveal]);
  useEffect(() => setPosition(null), [tex]);
  const hint =
    status === "copied"
      ? "LaTeX copied"
      : status === "error"
        ? "Copy unavailable"
        : "Copy LaTeX source";
  return (
    <span
      ref={wrapper}
      className={"fq-math-copy " + (display ? "display" : "")}
      title={pending ? "Formula is still streaming" : tex}
      onMouseEnter={reveal}
      onMouseLeave={hide}
      onMouseMove={() => {
        if (!position) reveal();
      }}
    >
      {html === null ? (
        <span className={"fq-math-source " + (display ? "display" : "")}>
          {raw}
        </span>
      ) : (
        // Only local KaTeX output enters this sink; never raw model HTML.
        // trust:false disables TeX HTML, URL and image commands.
        <span
          className={"fq-math " + (display ? "display" : "")}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {!pending && (
        <button
          ref={action}
          type="button"
          className="fq-copy-icon fq-math-copy-button"
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            opacity: position ? 1 : 0,
            pointerEvents: position ? "auto" : "none",
          }}
          aria-label={"Copy LaTeX: " + tex}
          title={hint}
          onFocus={() => {
            const bounds = wrapper.current?.getBoundingClientRect();
            const viewport = wrapper.current
              ?.closest(".fq-agent-thread")
              ?.getBoundingClientRect();
            if (
              bounds &&
              viewport &&
              (bounds.bottom < viewport.top || bounds.top > viewport.bottom)
            )
              wrapper.current?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            reveal();
          }}
          onBlur={hide}
          onMouseEnter={() => clearTimeout(hideTimer.current)}
          onMouseLeave={hide}
          onClick={(event) => {
            event.stopPropagation();
            void copy();
          }}
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
            ) : status === "error" ? (
              <path d="m4 4 8 8m0-8-8 8" />
            ) : (
              <>
                <rect x="5" y="5" width="8" height="9" rx="1.5" />
                <path d="M10 3V2H2v9h1" />
              </>
            )}
          </svg>
        </button>
      )}
      <span className="fq-sr-only" role="status">
        {status === "copied"
          ? "LaTeX source copied to clipboard"
          : status === "error"
            ? "Cannot copy LaTeX. Clipboard access is unavailable."
            : ""}
      </span>
    </span>
  );
});
