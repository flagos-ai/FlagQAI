import { useLayoutEffect, useRef, useState } from "react";

const storageKey = "fq-python-output-positions-v1";
type Position = { top: number; follow: boolean };
export function usePythonOutputPosition(
  id: string | undefined,
  visible: boolean,
  version: unknown,
  element: React.RefObject<HTMLPreElement | null>,
) {
  const [follow, setFollow] = useState(true);
  const positions = useRef<Record<string, Position>>({});
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    try {
      const raw = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      if (raw && typeof raw === "object") {
        positions.current = Object.fromEntries(
          Object.entries(raw)
            .filter((entry): entry is [string, Position] => {
              const value = entry[1] as Position | null;
              return (
                !!value &&
                Number.isFinite(value.top) &&
                value.top >= 0 &&
                typeof value.follow === "boolean"
              );
            })
            .slice(-30),
        );
      }
    } catch {
      /* Reading still works without browser storage. */
    }
  }
  const save = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(positions.current));
    } catch {
      /* Keep the current view without persistence. */
    }
  };
  const remember = () => {
    const node = element.current;
    if (!id || !node || !visible) return;
    positions.current = Object.fromEntries(
      [
        ...Object.entries(positions.current).filter(([key]) => key !== id),
        [
          id,
          {
            top: node.scrollTop,
            follow: node.scrollHeight - node.scrollTop - node.clientHeight < 16,
          },
        ],
      ].slice(-30),
    );
    setFollow(positions.current[id].follow);
    save();
  };
  useLayoutEffect(() => {
    const node = element.current;
    if (!id || !visible || !node) return;
    const position = positions.current[id];
    setFollow(position?.follow ?? true);
    node.scrollTop =
      !position || position.follow ? node.scrollHeight : position.top;
  }, [id, visible, version]);
  const jump = () => {
    if (element.current)
      element.current.scrollTop = element.current.scrollHeight;
    remember();
  };
  return { remember, follow, jump };
}
