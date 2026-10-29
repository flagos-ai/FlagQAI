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
