import type { SessionViewRow } from "../../../../packages/sdk/index.d.ts";

export function agentFailureGuidance(
  row: Pick<SessionViewRow, "kind" | "text">,
) {
  if (row.kind !== "notice") return null;
  if (/^turn max-tokens$/i.test(row.text.trim())) {
    return {
      title: "Model output limit reached",
      summary:
        "This turn ended before the model finished. Thinking also uses the output limit.",
      nextStep: "Ask for one smaller step to continue the task.",
    };
  }
  if (
    /reasoning_content[\s\S]*thinking mode[\s\S]*must be passed back/i.test(
      row.text,
    )
  ) {
    return {
      title: "Model could not resume thinking history",
      summary:
        "The provider rejected the thinking history sent with this turn.",
      nextStep:
        "Check that the selected endpoint and model support replaying thinking history, then continue the task.",
    };
  }
  return null;
}
