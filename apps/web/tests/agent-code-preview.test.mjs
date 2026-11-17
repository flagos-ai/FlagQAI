import test from "node:test";
import assert from "node:assert/strict";
import { codeStream, previewCode } from "../src/state/agent-code-preview.ts";
import { applyAgentRecord, emptyAgentView } from "../src/state/agent-view.ts";

const frame = (index, partialJson, extra = {}) => ({
  id: index + 1,
  session: "local",
  event: {
    type: "assistant.delta",
    attemptId: "attempt",
    index,
    delta: {
      kind: "tool-args",
      callId: "create",
      name: "workbench_create_python",
      partialJson,
    },
    ...extra,
  },
  meta: { wake: "sync" },
});

test("live code decodes every partial JSON boundary without executing or mutating the draft", () => {
  const source =
    'import flagquantum as fq\n# 中文, "source": "not a field"\nprint("\\u1234")\n';
  const json = JSON.stringify({
    name: "Shor demo",
    source,
    request_id: "stable",
  });
  let view = emptyAgentView(),
    previous = "";
  for (let i = 0; i < json.length; i++) {
    view = applyAgentRecord(view, frame(i, json[i]));
    const preview = previewCode(view.codeStream);
    if (preview) {
      assert.ok(source.startsWith(preview.source));
      assert.ok(preview.source.startsWith(previous));
      assert.equal(preview.name, "Shor demo");
      previous = preview.source;
    }
  }
  assert.equal(previous, source);
  assert.equal(previewCode(view.codeStream).requestId, "stable");
  assert.deepEqual(view.order, []);
});

test("escaped characters split across packets, reordered fields and duplicate deltas are safe", () => {
  let stream = codeStream(undefined, frame(0, '{"source":"a\\u4'));
  assert.equal(previewCode(stream).source, "a");
  stream = codeStream(
    stream,
    frame(1, 'e2d\\n\\"b\\\\c","name":"Arithmetic","request_id":"x"}'),
  );
  assert.equal(previewCode(stream).source, 'a中\n"b\\c');
  assert.equal(previewCode(stream).name, "Arithmetic");
  assert.equal(codeStream(stream, frame(1, "duplicate")), stream);
  assert.equal(previewCode({ ...stream, tool: "bash" }), undefined);
  assert.equal(
    previewCode({ ...stream, json: '{"metadata":{"source":"fake"}}' }),
    undefined,
  );
});

test("replay, subagents, abandoned attempts and terminal turns cannot show stale writing", () => {
  const first = frame(0, '{"source":"print(1)');
  const stream = codeStream(undefined, first);
  assert.equal(
    codeStream(undefined, { ...first, meta: { replay: true } }),
    undefined,
  );
  assert.equal(
    codeStream(
      undefined,
      frame(0, first.event.delta.partialJson, { parentCallId: "worker" }),
    ),
    undefined,
  );
  for (const event of [
    { type: "assistant.attempt.end", attemptId: "attempt", outcome: "aborted" },
    {
      type: "assistant.attempt.end",
      attemptId: "attempt",
      outcome: "abandoned",
    },
    { type: "turn.end" },
    { type: "assistant.attempt.start", attemptId: "new-attempt" },
    { type: "tool.result", callId: "create", isError: true },
    { type: "user.message" },
  ])
    assert.equal(codeStream(stream, { ...first, event }), undefined);
  assert.equal(
    codeStream(stream, {
      ...first,
      event: {
        type: "assistant.attempt.end",
        attemptId: "attempt",
        outcome: "committed",
      },
    }),
    stream,
  );
  assert.equal(codeStream(stream, frame(1, "x".repeat(200_001))), undefined);
});

test("unrelated live deltas and durable chunks do not replace an active preview", () => {
  const first = frame(0, '{"source":"print(1)');
  const stream = codeStream(undefined, first);
  const event = frame(1, "recorded", { seq: 5 });
  assert.equal(codeStream(undefined, event), undefined);
  const other = frame(2, '{"source":"unrelated"}');
  other.event.delta.name = "Bash";
  other.event.delta.callId = "other";
  assert.equal(codeStream(stream, other), stream);
  assert.equal(
    codeStream(stream, {
      ...first,
      event: { type: "user.message", source: "injected" },
    }),
    stream,
  );
});
