import type { ResearchTurn } from "./research-record";
import type { PlatformAction } from "../api/platform";
import type { progressTurns } from "./agent-progress";
import { splitWorkspaceContext } from "./agent-view.ts";
import { actionBelongsToTurn } from "./agent-turns.ts";
export function researchTurnsFromProgress(
  turns: ReturnType<typeof progressTurns>,
  actions: PlatformAction[],
): ResearchTurn[] {
  return turns.map((turn, index) => ({
    goal: splitWorkspaceContext(
      turn.rows.find((row) => row.kind === "user")?.text || "",
    ).text,
    active: turn.active,
    outcome: turn.outcome,
    candidates: actions
      .filter(
        (action) =>
          action.origin === "ui" &&
          action.result?.python_run &&
          actionBelongsToTurn(
            action.turn_seq,
            turn.rows.find((row) => row.kind === "user")?.seq,
            turns[index + 1]?.rows.find((row) => row.kind === "user")?.seq,
          ),
      )
      .map((action) => action.result!.python_run!.id),
    runs: [
      ...new Set(
        actions
          .filter(
            (action) =>
              action.origin !== "ui" &&
              actionBelongsToTurn(
                action.turn_seq,
                turn.rows.find((row) => row.kind === "user")?.seq,
                turns[index + 1]?.rows.find((row) => row.kind === "user")?.seq,
              ),
          )
          .flatMap((action) =>
            action.result?.python_run ? [action.result.python_run.id] : [],
          ),
      ),
    ],
  }));
}
