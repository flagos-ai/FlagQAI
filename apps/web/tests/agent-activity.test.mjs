import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cleanToolOutput,
  toolPresentation,
  previewOutput,
  activityDuration,
} from "../src/state/agent-activity.ts";
const root = fileURLToPath(new URL("../", import.meta.url)),
  temp = await mkdtemp(root + "node_modules/.agent-activity-test-");
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [root + "src/components/AgentActivity.tsx"],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  outfile: temp + "/render.mjs",
});
const { AgentTool, AgentThinking } = await import(
  pathToFileURL(temp + "/render.mjs")
);
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const workbench = (name, result, args = {}, status = "ok") => ({
  callId: "workbench-1",
  name,
  status,
  argsText: JSON.stringify(args),
  ...(result === undefined ? {} : { resultText: JSON.stringify(result) }),
});
test("workbench waiting distinguishes an active wait, a pending deadline and ready results", () => {
  const waiting = render(AgentTool, {
    tool: workbench(
      "workbench_wait_run",
      undefined,
      { run_id: "run-one" },
      "running",
    ),
  });
  assert.match(waiting, /Wait for result/);
  assert.match(waiting, />Waiting</);
  assert.doesNotMatch(waiting, /Status unavailable|No authoritative/);
  const pending = render(AgentTool, {
    tool: workbench("workbench_wait_run", {
      id: "run-one",
      status: "running",
      wait_outcome: "deadline",
    }),
  });
  assert.match(pending, /Still running/);
  assert.match(pending, /existing run continues/);
  assert.doesNotMatch(pending, />Done</);
  const ready = toolPresentation(
    workbench("workbench_wait_run", {
      id: "run-one",
      status: "completed",
      collection_status: "completed",
      experiments: [
        { id: "a", has_result: true },
        { id: "b", has_result: true },
      ],
    }),
  );
  assert.equal(ready.status, "Results ready");
  assert.match(ready.body, /2 saved experiments/);
});
test("a successful status read can expose a failed run without painting it as Done", () => {
  const tool = workbench(
    "workbench_inspect",
    {
      id: "failed-run",
      status: "failed",
      collection_status: "completed",
      logs: [{ stream: "stderr", text: "AttributeError: missing gate" }],
      source_hash: "source-version",
    },
    { resource: "run", id: "failed-run" },
  );
  const html = render(AgentTool, { tool });
  assert.match(html, /Run failed/);
  assert.match(html, /other workbench failed/);
  assert.match(html, /AttributeError: missing gate/);
  assert.doesNotMatch(html, />Done</);
  assert.equal(tool.status, "ok");
});
test("run inspection links only use returned run identities and never infer one from arguments", () => {
  const runTool = workbench("workbench_wait_run", {
    id: "failed-run",
    status: "failed",
    error: "Invalid gate",
  });
  assert.equal(toolPresentation(runTool).runId, "failed-run");
  const html = render(AgentTool, { tool: runTool, onOpenRun: async () => {} });
  assert.match(html, /View Python output/);
  assert.doesNotMatch(
    render(AgentTool, {
      tool: workbench("workbench_wait_run", undefined, {
        run_id: "not-confirmed",
      }),
      onOpenRun: async () => {},
    }),
    /View Python output/,
  );
  assert.equal(
    toolPresentation(
      workbench("workbench_run_python", {
        python_run: { id: "submitted-run", status: "running" },
      }),
    ).runId,
    "submitted-run",
  );
  assert.equal(
    toolPresentation(workbench("bash", { id: "not-a-run" })).runId,
    undefined,
  );
});
test("collection and absent artifacts remain distinct from successful execution", () => {
  const tool = (data) =>
    toolPresentation(
      workbench("workbench_wait_run", {
        id: "run",
        status: "completed",
        ...data,
      }),
    );
  assert.equal(
    tool({ collection_status: "collecting" }).status,
    "Collecting results",
  );
  const partial = tool({
    collection_status: "partial",
    collection_errors: [{ message: "One archive is unreadable" }],
  });
  assert.equal(partial.status, "Results need attention");
  assert.equal(partial.tone, "attention");
  assert.match(partial.body, /unreadable/);
  assert.equal(
    tool({ collection_status: "completed", experiments: [] }).status,
    "No saved experiment",
  );
  assert.equal(
    tool({
      collection_status: "completed",
      experiments: [{ id: "only-circuit", has_result: false }],
    }).status,
    "Circuit ready",
  );
  assert.equal(
    tool({
      collection_status: "completed",
      experiments: [{ id: "legacy-unknown" }],
    }).status,
    "Experiments ready",
  );
  assert.equal(tool({}).status, "Results need attention");
});
test("experiment summaries support compact and full records without claiming that navigation happened", () => {
  const compact = {
    id: "fqx-one",
    has_result: true,
    archive: { filename: "bell.fqx", sha256: "file-hash" },
    circuit: { qubits: 2, instruction_count: 2 },
  };
  const presented = toolPresentation(
    workbench(
      "workbench_present_experiment",
      { page: "jobs", evidence: compact },
      { view: "result" },
    ),
  );
  assert.equal(presented.label, "Verify experiment");
  assert.equal(presented.status, "Result available");
  assert.match(presented.body, /Follow Agent/);
  assert.doesNotMatch(presented.body, /Opened|Navigated/);
  const full = toolPresentation(
    workbench(
      "workbench_inspect",
      {
        id: "fqx-one",
        program: {
          compiled: { qubits: 2, instructions: [{ name: "H" }] },
          experiment: { filename: "bell.fqx", has_result: true },
        },
        job: { id: "fqx-one" },
      },
      { resource: "experiment", detail: "full" },
    ),
  );
  assert.equal(full.status, "Result available");
  assert.match(full.body, /1 gate/);
  const programOnly = toolPresentation(
    workbench(
      "workbench_inspect",
      { ...compact, has_result: false },
      { resource: "experiment" },
    ),
  );
  assert.equal(programOnly.status, "Circuit only");
  assert.equal(
    toolPresentation(
      workbench(
        "workbench_inspect",
        { id: "unknown" },
        { resource: "experiment" },
      ),
    ).status,
    "Status unavailable",
  );
});
test("friendly workbench cards do not spill code or machine argument JSON into the collapsed header", () => {
  const source = "print('private experiment code')";
  const tool = workbench(
    "workbench_create_python",
    { name: "Bell", file: { id: "new.py", revision: "abcdef", source } },
    { name: "Bell", source },
  );
  const html = render(AgentTool, { tool });
  assert.match(html, /Create model/);
  assert.match(html, /title="workbench_create_python"/);
  assert.doesNotMatch(html, /private experiment code|request_id/);
  assert.equal(JSON.parse(tool.resultText).file.source, source);
  const incomplete = toolPresentation({
    ...tool,
    status: "running",
    argsText: '{"source":"partial',
    resultText: "",
  });
  assert.equal(incomplete.detail, "");
  assert.equal(incomplete.body, "");
});
test("CLI tool header prefers native presentation and extracts paths without painting raw JSON", () => {
  const base = {
    callId: "1",
    name: "Read",
    status: "ok",
    argsText: '{"file_path":"src/main.py"}',
    resultText: "one\ntwo\nthree\nfour",
  };
  assert.equal(toolPresentation(base).detail, "src/main.py");
  const html = render(AgentTool, { tool: { ...base, durationMs: 1234 } });
  assert.match(html, /src\/main.py/);
  assert.match(html, /Done.*1.2 s/);
  assert.match(html, /Show 1 more line/);
  assert.doesNotMatch(html, /file_path|<pre>.*four/);
  assert.match(
    render(AgentTool, {
      tool: { ...base, status: "error", errorText: "permission denied" },
    }),
    /Failed/,
  );
});
test("running cards show five latest clean output lines, and previews cannot execute process controls", () => {
  const text = "\x1b[31mold\x1b[0m\n1\n2\n3\n4\n5\nprogress\rnew";
  assert.equal(cleanToolOutput(text), "old\n1\n2\n3\n4\n5\nnew");
  assert.deepEqual(previewOutput(text, true), {
    text: "2\n3\n4\n5\nnew",
    omitted: 2,
  });
  const html = render(AgentTool, {
    tool: {
      callId: "t",
      name: "Bash",
      status: "running",
      liveOutput: text,
      argsText: '{"command":"pytest"}',
    },
  });
  assert.match(html, /Running/);
  assert.match(html, /Live tool output/);
  assert.doesNotMatch(html, /\x1b/);
});
test("native diff and search results stay structured and completed result replaces call preview", () => {
  const tool = {
    callId: "d",
    name: "Edit",
    status: "ok",
    callView: { card: "diff", title: "old preview", diffs: [] },
    resultView: {
      card: "diff",
      title: "Edit main.py",
      diffs: [{ path: "main.py", patch: "@@ -1 +1 @@\n-old\n+new" }],
    },
  };
  assert.equal(toolPresentation(tool).detail, "Edit main.py");
  assert.equal(toolPresentation(tool).category, "mutate");
  assert.match(render(AgentTool, { tool }), /removed/);
  assert.equal(
    toolPresentation({
      ...tool,
      resultView: {
        card: "search",
        shape: "paths",
        paths: ["one.py", "two.py"],
      },
    }).body,
    "one.py\ntwo.py",
  );
});
test("thinking distinguishes active preview and settled duration without fabricating missing telemetry", () => {
  const row = { id: 1, kind: "reasoning", text: "one\ntwo\nthree\nfour" };
  const active = render(AgentThinking, { row, active: true });
  assert.match(active, /Thinking…/);
  assert.match(active, /fq-thinking-preview/);
  assert.match(active, /two\nthree\nfour/);
  const done = render(AgentThinking, {
    row: { ...row, durationMs: 2500, reasoningTokens: 120 },
    active: false,
  });
  assert.match(done, /Thought/);
  assert.match(done, /2.5 s/);
  assert.match(done, /120 tokens/);
  assert.doesNotMatch(done, /fq-thinking-preview/);
  assert.equal(activityDuration(undefined), "");
  assert.equal(activityDuration(0), "0 ms");
  assert.equal(
    render(AgentThinking, { row: { ...row, text: "" }, active: false }),
    "",
  );
});
