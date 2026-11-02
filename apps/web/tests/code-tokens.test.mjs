import test from "node:test";
import assert from "node:assert/strict";
import { codeTokens, codeTokenLines } from "../src/state/code-tokens.ts";
test("syntax colors preserve exact source including comments, strings and whitespace", () => {
  for (const [language, code] of [
    [
      "python",
      'import flagquantum as fq\n# rx(0, 2)\ncircuit.rx(0, pi / 2)\nprint("<sample> # 1")\n',
    ],
    [
      "qasm",
      '// Example\ninclude "qelib1.inc";\nrx(pi/2) q[0];\nmeasure q[0] -> c[0];',
    ],
  ]) {
    const tokens = codeTokens(code, language);
    assert.equal(tokens.map((t) => t.text).join(""), code);
    assert.ok(tokens.some((t) => t.kind === "comment"));
    assert.ok(tokens.some((t) => t.kind === "string"));
    assert.ok(tokens.some((t) => t.kind === "number"));
    assert.ok(tokens.some((t) => t.kind === "function" && t.text === "rx"));
    assert.ok(tokens.some((t) => t.kind === "keyword"));
  }
});
test("numbered snapshots retain blank lines, indentation and exact token text", () => {
  for (const source of [
    "",
    "\n",
    "\n\n",
    "# context\n\n  raise ValueError('x')\n",
    "print('a')\r\n\tpass",
  ]) {
    const lines = codeTokenLines(codeTokens(source, "python"));
    assert.equal(
      lines.map((line) => line.map((token) => token.text).join("")).join("\n"),
      source,
    );
    assert.equal(lines.length, source.split("\n").length);
  }
});
