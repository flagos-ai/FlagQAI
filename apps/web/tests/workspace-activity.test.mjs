import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  workspaceActivityGroups,
  workspacePageLabel,
} from "../src/state/workspace-activity.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(root + "node_modules/.workspace-activity-test-");
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [root + "src/components/AgentWorkspaceActions.tsx"],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  outfile: temp + "/render.mjs",
});
const { AgentWorkspaceActions } = await import(
  pathToFileURL(temp + "/render.mjs")
);

const focus = (id, extra = {}) => ({
  id,
  operation: "focus",
  status: "completed",
  result: { page: "program", program_id: "fqx-example" },
  ...extra,
});
test("only successful page-only changes move into the compact navigation history", () => {
  const actions = [
    focus("navigation"),
    focus("failed", { status: "failed", error: "Archive missing" }),
    focus("running", { status: "running" }),
    focus("comparison", {
      result: { page: "jobs", comparison: { left: "a", right: "b" } },
    }),
    focus("artifact", { result: { page: "program", program: { id: "a" } } }),
    focus("unknown", { operation: "future.operation" }),
    focus("error", { error: "Attention required" }),
  ];
  const grouped = workspaceActivityGroups(actions);
  assert.deepEqual(
    grouped.navigation.map((action) => action.id),
    ["navigation"],
  );
  assert.deepEqual(grouped.recent, actions.slice(1));
  assert.deepEqual(grouped.earlier, []);
  assert.equal(workspacePageLabel("program"), "Quantum");
  assert.equal(workspacePageLabel("jobs"), "Results");
  assert.equal(workspacePageLabel("unrecognized"), "Workbench");
});

test("long activity keeps every record accessible and never folds earlier errors or active work", () => {
  const actions = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    operation: "model.create",
    status: index === 0 ? "failed" : index === 1 ? "running" : "completed",
  }));
  const grouped = workspaceActivityGroups(actions);
  assert.deepEqual(
    grouped.recent.map((action) => action.id),
    ["0", "1", "12", "13", "14", "15", "16", "17", "18", "19"],
  );
  assert.equal(grouped.earlier.length, 10);
  const records = [
    ...grouped.recent,
    ...grouped.earlier,
    ...grouped.navigation,
  ];
  assert.equal(
    new Set(records.map((action) => action.id)).size,
    actions.length,
  );
  assert.ok(records.every((action) => actions.includes(action)));
  assert.equal(actions.length, 20);
});

test("collapsed earlier activity does not mount old cards or expose their output", () => {
  const actions = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    operation: "model.create",
    status: "completed",
    result: {
      name: "saved-model-" + index,
      file: { id: "model-" + index, source: "", revision: "a" },
    },
  }));
  const html = renderToStaticMarkup(
    React.createElement(AgentWorkspaceActions, {
      actions,
      jobs: [],
      onOpen() {},
    }),
  );
  assert.match(html, /Earlier activity · 4/);
  assert.equal(
    (html.match(/class="fq-workspace-artifact completed"/g) || []).length,
    8,
  );
  assert.doesNotMatch(html, /saved-model-0|saved-model-1</);
  assert.match(html, /saved-model-11/);
});
