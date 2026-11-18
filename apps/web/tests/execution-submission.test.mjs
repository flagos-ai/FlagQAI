import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { restoreWorkspace } from "../src/state/persistence.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(root + "node_modules/.execution-submission-");
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  entryPoints: [root + "src/hooks/useQuantumWorkspace.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: temporary + "/hook.mjs",
  plugins: [
    {
      name: "isolated-hook",
      setup(builder) {
        builder.onResolve(
          { filter: /^react$|useComputeBackend$/ },
          ({ path }) => ({
            path,
            namespace: "hook-fixture",
          }),
        );
        builder.onLoad(
          { filter: /.*/, namespace: "hook-fixture" },
          ({ path }) => ({
            contents:
              path === "react"
                ? `
          export const useEffect = () => {};
          export const useCallback = (fn) => fn;
          export const useRef = (current) => ({current});
          export const useState = (initial) => [initial, () => {}];
          export const useReducer = () => [
            globalThis.executionFixture.state,
            (action) => globalThis.executionFixture.actions.push(action),
          ];
        `
                : `
          export const useComputeBackend = () => globalThis.executionFixture.backend;
        `,
          }),
        );
      },
    },
  ],
});
const { useQuantumWorkspace } = await import(
  pathToFileURL(temporary + "/hook.mjs")
);

test("shared execution blocks unavailable targets for both API paths and preserves source", async () => {
  const oldLocation = globalThis.location;
  globalThis.location = { hash: "#execution" };
  try {
    for (const blocked of [
      "No QPU is connected.",
      "Compute environment changed. Apply an execution profile.",
    ]) {
      for (const context of [undefined, { client: "test", session: "test" }]) {
        const state = {
          ...restoreWorkspace({ getItem: () => null }, "execution"),
          language: "qasm",
          source: "unsaved draft",
          execution: { source: "saved circuit" },
        };
        globalThis.executionFixture = {
          state,
          actions: [],
          backend: { runBlockedReason: blocked },
        };
        const workspace = useQuantumWorkspace();
        workspace.setActionContext(context);
        await workspace.run();
        assert.deepEqual(globalThis.executionFixture.actions, [
          {
            type: "error",
            source: "saved circuit",
            message: blocked,
          },
        ]);
        assert.equal(state.source, "unsaved draft");
      }
    }
  } finally {
    globalThis.location = oldLocation;
    delete globalThis.executionFixture;
  }
});

test("a usable target submits the selected archive exactly once through the shared entry", async () => {
  const oldLocation = globalThis.location,
    oldFetch = globalThis.fetch;
  globalThis.location = { hash: "#execution" };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return { ok: true, json: async () => ({ id: "new-job" }) };
  };
  try {
    globalThis.executionFixture = {
      state: {
        ...restoreWorkspace({ getItem: () => null }, "execution"),
        language: "qasm",
        source: "unsaved draft",
        execution: { name: "Saved circuit", source: "selected archive source" },
      },
      actions: [],
      backend: { runBlockedReason: "" },
    };
    const workspace = useQuantumWorkspace();
    await Promise.all([workspace.run(), workspace.run()]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/api/jobs");
    assert.equal(calls[0][1].source, "selected archive source");
    assert.ok(
      globalThis.executionFixture.actions.some(
        (action) => action.type === "job",
      ),
    );
  } finally {
    globalThis.location = oldLocation;
    globalThis.fetch = oldFetch;
    delete globalThis.executionFixture;
  }
});
