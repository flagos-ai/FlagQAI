import { useState } from "react";
import { readJSON } from "../state/persistence";

export function usePanelSize(
  key: string,
  initial: number,
  min: number,
  max: number,
) {
  const [value, setValue] = useState(() => {
    const saved = readJSON<Record<string, number>>(
      localStorage,
      "fq-pane-layout-v1",
      {},
    );
    return Math.min(max, Math.max(min, saved[key] || initial));
  });
  const update = (next: number) => {
    const v = Math.max(min, Math.min(max, next));
    setValue(v);
    try {
      const saved = readJSON<Record<string, number>>(
        localStorage,
        "fq-pane-layout-v1",
        {},
      );
      localStorage.setItem(
        "fq-pane-layout-v1",
        JSON.stringify({ ...saved, [key]: v }),
      );
    } catch {}
  };
  return [value, update] as const;
}
