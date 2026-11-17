import type { AgentEventRecord } from "../../../../packages/sdk/index.d.ts";

export type AgentCodeStream = {
  attempt: string;
  callId: string;
  tool: string;
  json: string;
  index: number;
};
export type AgentCodePreview = {
  id: string;
  name: string;
  source: string;
  requestId?: string;
};

// Decode complete characters from an unfinished JSON string. Never evaluate
// model output, invent missing characters, or parse nested strings as fields.
function stringAt(text: string, start: number) {
  if (text[start] !== '"') return;
  let value = "",
    i = start + 1;
  while (i < text.length) {
    const char = text[i++];
    if (char === '"') return { value, end: i, complete: true };
    if (char !== "\\") {
      value += char;
      continue;
    }
    if (i === text.length) break;
    const escape = text[i++];
    if (escape === "u") {
      if (text.length - i < 4) break;
      const hex = text.slice(i, i + 4);
      if (!/^[a-f\d]{4}$/i.test(hex)) return;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      const decoded: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (!(escape in decoded)) return;
      value += decoded[escape];
    }
  }
  return { value, end: i, complete: false };
}

export function previewCode(
  stream?: AgentCodeStream,
): AgentCodePreview | undefined {
  if (!stream || stream.tool !== "workbench_create_python") return;
  const text = stream.json;
  let i = 0,
    name = "Agent Python",
    source: string | undefined,
    requestId: string | undefined;
  const whitespace = () => {
    while (/\s/.test(text[i] || "x")) i++;
  };
  whitespace();
  if (text[i++] !== "{") return;
  while (i < text.length) {
    whitespace();
    const key = stringAt(text, i);
    if (!key?.complete) break;
    i = key.end;
    whitespace();
    if (text[i++] !== ":") return;
    whitespace();
    const value = stringAt(text, i);
    // The native tool schema contains only string fields.
    if (!value) return;
    if (key.value === "source") source = value.value;
    if (key.value === "name" && value.complete)
      name = value.value.slice(0, 200);
    if (key.value === "request_id" && value.complete) requestId = value.value;
    if (!value.complete) break;
    i = value.end;
    whitespace();
    if (text[i++] !== ",") break;
  }
  return source === undefined
    ? undefined
    : { id: stream.attempt + ":" + stream.callId, name, source, requestId };
}

export function codeStream(
  previous: AgentCodeStream | undefined,
  record: AgentEventRecord,
): AgentCodeStream | undefined {
  const event = record.event;
  if (record.meta?.replay) return previous;
  if (
    (event.type === "session.view" && event.working === false) ||
    (event.type === "session.status" && event.status === "idle")
  )
    return;
  if (
    event.type === "turn.end" ||
    (event.type === "user.message" && event.source !== "injected") ||
    (event.type === "assistant.attempt.start" &&
      event.attemptId !== previous?.attempt) ||
    (event.type === "tool.result" &&
      event.callId === previous?.callId &&
      event.isError === true) ||
    (event.type === "assistant.attempt.end" &&
      event.attemptId === previous?.attempt &&
      event.outcome !== "committed")
  )
    return;
  if (
    event.type !== "assistant.delta" ||
    event.parentCallId ||
    typeof event.seq === "number"
  )
    return previous;
  const delta = event.delta as
    | { kind?: string; name?: string; callId?: string; partialJson?: string }
    | undefined;
  if (
    delta?.kind !== "tool-args" ||
    typeof delta.callId !== "string" ||
    typeof delta.partialJson !== "string" ||
    typeof event.attemptId !== "string" ||
    typeof event.index !== "number"
  )
    return previous;
  const same =
    previous?.attempt === event.attemptId && previous.callId === delta.callId;
  if (delta.name && delta.name !== "workbench_create_python") return previous;
  if (same && event.index <= previous.index) return previous;
  const json = (same ? previous.json : "") + delta.partialJson;
  if (json.length > 200_000) return;
  return {
    attempt: event.attemptId,
    callId: delta.callId,
    tool: delta.name || (same ? previous.tool : ""),
    json,
    index: event.index,
  };
}
