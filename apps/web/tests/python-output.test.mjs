import test from "node:test";
import assert from "node:assert/strict";
import { pythonOutputText } from "../src/state/python-output.ts";

test("console copy preserves interleaved streams, Unicode and exact whitespace", () => {
  assert.equal(
    pythonOutputText({
      logs: [
        { stream: "stdout", text: "α\r\n  value: " },
        { stream: "stderr", text: "warning\n" },
        { stream: "stdout", text: "done" },
      ],
    }),
    "α\r\n  value: warning\ndone",
  );
});
test("console copy includes displayed truncation and runner errors but no empty-state copy", () => {
  assert.equal(pythonOutputText(), "");
  assert.equal(pythonOutputText({ logs: [] }), "");
  assert.equal(
    pythonOutputText({ logs: [], error: "Connection lost" }),
    "\nConnection lost",
  );
  assert.equal(
    pythonOutputText({
      logs: [{ stream: "stdout", text: "partial" }],
      truncated: true,
      error: "Exit 1",
    }),
    "partial\nOutput truncated at 64 KiB.\nExit 1",
  );
});
