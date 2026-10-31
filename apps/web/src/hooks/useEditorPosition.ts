import { useLayoutEffect, useRef } from "react";
import {
  editorPosition,
  readPositions,
  rememberPosition,
} from "../state/workspace-continuity";
export function useEditorPosition(
  key: string,
  editor: React.RefObject<HTMLTextAreaElement | null>,
  onRestore: (view: {
    top: number;
    left: number;
    start: number;
    end: number;
  }) => void,
) {
  const cache = useRef<ReturnType<typeof readPositions> | undefined>(undefined);
  if (!cache.current) {
    try {
      cache.current = readPositions(localStorage);
    } catch {
      cache.current = {};
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    try {
      localStorage.setItem(
        "fq-editor-positions-v1",
        JSON.stringify(cache.current),
      );
    } catch {
      /* Position recovery remains available in memory. */
    }
  };
  const capture = (element: HTMLTextAreaElement) => {
    cache.current = rememberPosition(
      cache.current!,
      key,
      editorPosition(
        {
          start: element.selectionStart,
          end: element.selectionEnd,
          direction: element.selectionDirection,
          top: element.scrollTop,
          left: element.scrollLeft,
        },
        element.value.length,
      ),
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 100);
  };
  useLayoutEffect(() => {
    const element = editor.current;
    if (element) {
      const view = editorPosition(cache.current![key], element.value.length);
      element.setSelectionRange(view.start, view.end, view.direction);
      element.scrollTop = view.top;
      element.scrollLeft = view.left;
      onRestore({ ...view, top: element.scrollTop, left: element.scrollLeft });
    }
    return flush;
  }, [key]);
  useLayoutEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return capture;
}
