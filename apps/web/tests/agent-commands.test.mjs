import test from "node:test";
import assert from "node:assert/strict";
import {
  commandQuery,
  matchCommands,
  exactCommand,
} from "../src/state/agent-commands.ts";
test("slash menu lists only implemented Web actions and filters command, alias and multilingual keywords", () => {
  assert.deepEqual(
    matchCommands("/").map((c) => c.name),
    ["new", "resume", "model", "provider"],
  );
  assert.deepEqual(
    matchCommands("/pro").map((c) => c.name),
    ["provider"],
  );
  assert.deepEqual(
    matchCommands("/配置").map((c) => c.name),
    ["provider"],
  );
  assert.deepEqual(
    matchCommands("/MODELS").map((c) => c.name),
    ["model"],
  );
  assert.equal(exactCommand("/new").tab, "new");
  assert.equal(exactCommand("/resume").tab, "resume");
  assert.equal(exactCommand("/models").tab, "models");
  assert.equal(exactCommand("/provider").tab, "providers");
  assert.equal(exactCommand("/pro"), undefined);
  assert.deepEqual(matchCommands("/unknown"), []);
});
test("ordinary prose, file paths and multiline prompts do not trigger command interception", () => {
  for (const value of [
    "explain /model",
    "/Users/me/file.py",
    "hello",
    "/model\nextra text",
    "/provider settings",
  ])
    assert.equal(commandQuery(value), null);
});
