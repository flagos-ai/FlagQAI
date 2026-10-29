import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyAgentView, applyAgentRecord } from "../src/state/agent-view.ts";
import { mergeChildren, childTranscript } from "../src/state/agent-progress.ts";
import { transcriptTurns } from "../src/state/agent-turns.ts";
const record = (id, event) => ({
  id,
  session: "test",
  event,
  meta: { wake: "sync", replay: true },
});
test("Todo snapshots and child lifecycles replay per turn without leaking completed tasks", () => {
  let view = emptyAgentView(),
    id = 0;
  const apply = (event) => {
    view = applyAgentRecord(view, record(++id, event));
  };
  apply({ type: "user.message", seq: 10 });
  apply({ type: "turn.start", turn: 1, time: 100 });
  apply({
    type: "todo.write",
    items: [{ content: "Inspect", status: "in_progress" }],
  });
  apply({
    type: "subagent.start",
    agentId: "child",
    description: "Review",
    time: 150,
  });
  apply({
    type: "subagent.progress",
    agentId: "child",
    summary: "Reading",
    lastTool: "Read",
  });
  apply({
    type: "todo.write",
    items: [{ content: "Inspect", status: "completed" }],
  });
  apply({
    type: "subagent.end",
    agentId: "child",
    status: "failed",
    summary: "Permission denied",
    time: 450,
  });
  apply({ type: "turn.end", turn: 1, time: 500 });
  assert.equal(view.progress[10].todos[0].status, "completed");
  assert.equal(view.progress[10].children.child.status, "failed");
  assert.equal(view.progress[10].children.child.durationMs, 300);
  apply({ type: "user.message", seq: 20 });
  apply({ type: "turn.start", turn: 2, time: 600 });
  apply({
    type: "session.view",
    reset: true,
    rows: [],
    order: [],
    working: true,
    todos: [{ content: "Inspect", status: "completed" }],
  });
  assert.equal(view.progress[20], undefined);
  // An unchanged native list must not carry into a new task.
  apply({ type: "user.message", seq: 30 });
  apply({ type: "turn.start", turn: 3, time: 700 });
  apply({
    type: "session.view",
    reset: false,
    rows: [],
    order: [],
    working: true,
    todos: [{ content: "Inspect", status: "completed" }],
  });
  assert.equal(view.progress[30], undefined);
  apply({ type: "todo.write", items: [] });
  assert.deepEqual(view.progress[30].todos, []);
  assert.equal(view.progress[10].children.child.lastTool, "Read");
});
test("projection-only Todo updates remain live and child rows fold before the final answer", () => {
  let state = applyAgentRecord(
    emptyAgentView(),
    record(1, { type: "user.message", seq: 10 }),
  );
  for (const [id, status] of [
    [2, "in_progress"],
    [3, "completed"],
  ])
    state = applyAgentRecord(
      state,
      record(id, {
        type: "session.view",
        rows: [],
        order: [],
        todos: [{ content: "Inspect", status }],
        working: false,
      }),
    );
  assert.equal(state.progress[10].todos[0].status, "completed");
  state.rows = {
    1: { id: 1, kind: "user", seq: 10, text: "Review" },
    2: {
      id: 2,
      kind: "subagent",
      text: "Child",
      subagent: { agentId: "a", status: "completed", description: "Child" },
    },
    3: { id: 3, kind: "assistant", text: "Done" },
  };
  state.order = [1, 2, 3];
  const turn = transcriptTurns(state)[0];
  assert.deepEqual(
    turn.work.map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    turn.visible.map((row) => row.id),
    [1, 3],
  );
  const merged = mergeChildren(undefined, turn.rows, [
    { id: "a", description: "Child", status: "unknown", createdAt: 1 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "completed");
});
test("child history paints readable messages/tools and leaves model HTML as data", () => {
  assert.deepEqual(
    childTranscript([
      { type: "assistant.message", blocks: [{ type: "text", text: "Result" }] },
      { type: "tool.call", name: "Read", argsJson: "{}" },
      { type: "assistant.delta", delta: {} },
    ]).map((row) => row.label),
    ["Subagent", "Read"],
  );
});
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(root + "node_modules/.agent-progress-test-");
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [root + "src/components/AgentProgress.tsx"],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  outfile: temp + "/render.mjs",
});
const { AgentProgress } = await import(pathToFileURL(temp + "/render.mjs"));
test("compact progress exposes pending work and failures without falsely completing them", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentProgress, {
      todos: [
        { content: "Review <script>", status: "completed" },
        { content: "Verify", status: "in_progress" },
      ],
      children: [
        {
          id: "child",
          description: "Audit",
          status: "failed",
          error: "Denied",
        },
      ],
    }),
  );
  assert.match(html, /Tasks 1\/2/);
  assert.match(html, /1 of 2 tasks completed/);
  assert.match(html, /Failed/);
  assert.match(html, /Denied/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a background child after the final reply never folds the final answer", () => {
  const state = {
    ...emptyAgentView(),
    order: [1, 2, 3],
    rows: {
      1: { id: 1, kind: "user", text: "Review" },
      2: { id: 2, kind: "assistant", text: "Final answer" },
      3: { id: 3, kind: "subagent", text: "Background work" },
    },
  };
  const turn = transcriptTurns(state)[0];
  assert.deepEqual(
    turn.visible.map((row) => row.id),
    [1, 2],
  );
  assert.deepEqual(
    turn.work.map((row) => row.id),
    [3],
  );
});

test("a continued child updates its latest turn while preserving earlier results", () => {
  let state = emptyAgentView(),
    id = 0;
  const apply = (event) => {
    state = applyAgentRecord(state, record(++id, event));
  };
  apply({ type: "user.message", seq: 1 });
  apply({
    type: "subagent.start",
    agentId: "child",
    description: "First task",
    time: 100,
  });
  apply({
    type: "subagent.end",
    agentId: "child",
    status: "completed",
    time: 200,
  });
  apply({ type: "user.message", seq: 2 });
  apply({
    type: "subagent.start",
    agentId: "child",
    description: "Follow-up task",
    time: 300,
  });
  apply({
    type: "subagent.end",
    agentId: "child",
    status: "failed",
    time: 400,
  });
  assert.equal(state.progress[1].children.child.status, "completed");
  assert.equal(state.progress[2].children.child.status, "failed");
});

test("the composer counter includes parallel and older background children but clears settled work", async () => {
  const { dockChildren } = await import("../src/state/agent-progress.ts");
  const state = {
    ...emptyAgentView(),
    working: true,
    order: [1, 2],
    rows: {
      1: { id: 1, kind: "user", seq: 10, text: "Old task" },
      2: { id: 2, kind: "user", seq: 20, text: "Current task" },
    },
    progress: {
      10: {
        children: {
          a: { id: "a", description: "Background", status: "running" },
          b: { id: "b", description: "Done", status: "completed" },
        },
      },
      20: {
        children: { c: { id: "c", description: "Current", status: "running" } },
      },
    },
  };
  assert.deepEqual(
    dockChildren(state, []).map((child) => child.id),
    ["a", "c"],
  );
  state.working = false;
  state.progress[10].children.a.status = "completed";
  state.progress[20].children.c.status = "completed";
  assert.deepEqual(dockChildren(state, []), []);
});

await build({
  entryPoints: [root + "src/components/AgentSubagentDock.tsx"],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  outfile: temp + "/dock.mjs",
});
const { AgentSubagentDock } = await import(pathToFileURL(temp + "/dock.mjs"));
test("the footer always shows a gray idle dot or a colored parallel count", () => {
  const render = (children) =>
    renderToStaticMarkup(React.createElement(AgentSubagentDock, { children }));
  const idle = render([]);
  assert.match(idle, /fq-subagent-indicator idle/);
  assert.match(idle, /No subagents running/);
  assert.doesNotMatch(idle, /<span aria-hidden="true">0<\/span>/);
  const active = render([
    { id: "a", description: "A", status: "running" },
    { id: "b", description: "B", status: "starting" },
    { id: "c", description: "C", status: "completed" },
  ]);
  assert.match(active, /fq-subagent-indicator active/);
  assert.match(active, /2 subagents running/);
  assert.match(active, /<span aria-hidden="true">2<\/span>/);
});
