import type {
  WorkspaceAction,
  WorkspaceState,
  SourceLanguage,
} from "../contracts/quantum-workspace";
export type AgentReview = {
  id: string;
  revision: string;
  mode: "incoming" | "synced";
  name: string;
  language: SourceLanguage;
  base: string;
  draft: string;
  before: string;
  incoming: string;
  merged: string;
};
export function openAgentReview(state: WorkspaceState): AgentReview | null {
  const link = state.editorLink;
  if (!link || (!link.incoming && !link.change)) return null;
  return {
    id: link.id,
    revision: link.incoming?.revision || link.change!.revision,
    mode: link.incoming ? "incoming" : "synced",
    name: state.name,
    language: state.language || "qasm",
    base: link.incoming ? link.base : link.change!.before,
    draft: state.source,
    before: link.incoming ? state.source : link.change!.before,
    incoming:
      link.incoming?.source ?? link.change!.agentSource ?? link.change!.after,
    merged: state.source,
  };
}
export function reviewMatches(state: WorkspaceState, review: AgentReview) {
  const link = state.editorLink;
  return (
    state.source === review.draft &&
    state.name === review.name &&
    (state.language || "qasm") === review.language &&
    link?.id === review.id &&
    (review.mode === "incoming"
      ? link.incoming?.revision === review.revision &&
        link.incoming.source === review.incoming
      : !link.incoming &&
        link.change?.revision === review.revision &&
        (link.change.agentSource ?? link.change.after) === review.incoming)
  );
}
export type ReviewAction = Extract<
  WorkspaceAction,
  { type: "resolve-file" | "review-agent-change" }
>;
export function acceptReviewAction(
  state: WorkspaceState,
  review: AgentReview,
  source = review.incoming,
): ReviewAction {
  if (!reviewMatches(state, review))
    throw Error(
      "The editor or Agent file changed. Refresh the comparison before accepting or running.",
    );
  if (review.mode === "incoming")
    return {
      type: "resolve-file",
      id: review.id,
      revision: review.revision,
      expectedSource: review.draft,
      source,
    };
  if (state.editorLink?.change?.outcome !== "pending")
    throw Error("This Agent change has already been reviewed.");
  // A synchronized file may have newer local edits: accepting keeps those edits.
  return {
    type: "review-agent-change",
    id: review.id,
    revision: review.revision,
    expectedSource: review.draft,
    decision: "accept",
  };
}
export function reviewActionValid(state: WorkspaceState, action: ReviewAction) {
  const link = state.editorLink;
  return (
    !!link &&
    link.id === action.id &&
    state.source === action.expectedSource &&
    (action.type === "resolve-file"
      ? link.incoming?.revision === action.revision
      : !link.incoming &&
        link.change?.revision === action.revision &&
        link.change.outcome === "pending" &&
        action.decision === "accept")
  );
}
