import { useState } from "react";
import { readFolders } from "../state/workspace-continuity";
export function useProjectFolders(projectId?: string) {
  const [groups, setGroups] = useState(() => {
    try {
      return readFolders(localStorage);
    } catch {
      return {};
    }
  });
  const closed = projectId ? groups[projectId] || [] : [];
  const toggle = (path: string, folded: boolean) => {
    if (!projectId) return;
    setGroups((previous) => {
      const paths = previous[projectId] || [];
      if (paths.includes(path) === folded) return previous;
      const next = Object.fromEntries(
        [
          ...Object.entries(previous).filter(([key]) => key !== projectId),
          [
            projectId,
            (folded
              ? [...paths, path]
              : paths.filter((item) => item !== path)
            ).slice(-128),
          ],
        ].slice(-32),
      );
      try {
        localStorage.setItem("fq-project-folders-v1", JSON.stringify(next));
      } catch {
        /* Folder controls remain usable without storage. */
      }
      return next;
    });
  };
  return { closed, toggle };
}
