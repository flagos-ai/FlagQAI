import { splitWorkspaceContext, type AgentView } from "./agent-view.ts";

// Local suggestions use only the latest exchange; they never submit a model request.
export function agentFollowUp(view: AgentView) {
  if (
    !view.projected ||
    view.working ||
    view.context?.compaction ||
    Object.keys(view.permissions).length ||
    Object.keys(view.questions).length ||
    ["stopping", "stopped", "unknown", "failed"].includes(view.stop || "")
  )
    return null;
  const rows = view.order.map((id) => view.rows[id]).filter(Boolean);
  const user = [...rows].reverse().find((row) => row.kind === "user");
  if (!user) return null;
  const reply = rows
    .slice(rows.indexOf(user) + 1)
    .reverse()
    .find((row) => row.kind === "assistant" && row.text.trim());
  if (!reply) return null;
  const outcome = view.turnTimings?.[user.seq ?? user.id]?.outcome;
  if (outcome && outcome !== "completed") return null;
  const question = splitWorkspaceContext(user.text).text;
  const chinese = /[\u3400-\u9fff]/.test(question);
  const context = (question + "\n" + reply.text).slice(0, 16000);
  let prompt: string;
  if (/error|failed|traceback|报错|失败|异常/i.test(context)) {
    prompt = chinese
      ? "下一步该如何定位这个问题，并验证修复？"
      : "What should we check next to diagnose this issue and verify a fix?";
  } else if (/synth|compil|综合|编译|T.gate|T门|qubit|量子门/i.test(context)) {
    prompt = chinese
      ? "哪些资源开销最大，下一步可以如何优化并验证正确性？"
      : "Which resources dominate, and how can we reduce them while verifying correctness?";
  } else if (/result|compar|metric|结果|比较|指标|QAOA/i.test(context)) {
    prompt = chinese
      ? "这些结果说明了什么，下一步应比较哪些参数？"
      : "What do these results tell us, and which parameters should we compare next?";
  } else if (/notebook|code|circuit|代码|电路|单元/i.test(context)) {
    prompt = chinese
      ? "能用一个最小可运行示例验证刚才的解释吗？"
      : "Can we verify that explanation with a minimal runnable example?";
  } else {
    prompt = chinese
      ? "如何把刚才的思路变成一个可验证的研究步骤？"
      : "How can we turn that into a concrete, verifiable research step?";
  }
  if (question.trim() === prompt) {
    prompt = chinese
      ? "这个方案有哪些假设和局限，应该如何检查？"
      : "What assumptions and limitations should we check in this approach?";
  }
  return { key: `${user.id}:${reply.id}:${reply.text}`, prompt };
}
