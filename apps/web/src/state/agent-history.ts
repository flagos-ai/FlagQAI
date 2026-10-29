import type {
  SessionCatalogResource,
  SessionResource,
} from "../../../../packages/sdk/index.d.ts";
export function filterSessionHistory(
  sessions: SessionCatalogResource[],
  query: string,
  cwd: string,
) {
  const search = query.trim().toLocaleLowerCase();
  return sessions
    .filter(
      (s) =>
        s.cwd === cwd &&
        [s.title, s.sessionId, s.backendId, s.model, s.branch]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(search),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}
export function sessionResumeBlock(
  item: SessionCatalogResource,
  current: SessionResource | null,
  locked: boolean,
): string | undefined {
  if (locked) return "Finish the current turn and pending decisions first.";
  if (item.availability === "occupied")
    return "In use by the CLI or another client.";
  if (
    current?.sessionId === item.sessionId &&
    current.backendId === item.backendId
  )
    return "Current session";
}

export function historyActionBlock(
  item: SessionCatalogResource,
  current: SessionResource | null,
  locked: boolean,
  action: "rename" | "trash" | "restore",
): string | undefined {
  if (locked) return "Finish the current turn and pending decisions first.";
  if (action === "restore") return;
  if (item.availability === "occupied") return "In use by another client.";
  if (action === "rename" && item.actions?.rename === false)
    return "This backend does not support renaming.";
  if (
    action === "trash" &&
    current?.backendId === item.backendId &&
    current.sessionId === item.sessionId
  )
    return "Start or resume another chat before deleting the current conversation.";
}
