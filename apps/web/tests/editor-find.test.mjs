import test from "node:test";
import assert from "node:assert/strict";
import { findCodeMatches, markCodeMatch } from "../src/state/editor-find.ts";
import { codeTokens } from "../src/state/code-tokens.ts";
test("code search treats regex symbols literally and wraps safely around Unicode offsets", () => {
  assert.deepEqual(findCodeMatches("[q] [Q] .* [q]", "[q]"), [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 11, end: 14 },
  ]);
  assert.deepEqual(findCodeMatches("[q] [Q]", "[q]", true), [
    { start: 0, end: 3 },
  ]);
  assert.deepEqual(findCodeMatches("İ 😀 A a", "a"), [
    { start: 5, end: 6 },
    { start: 7, end: 8 },
  ]);
  assert.deepEqual(findCodeMatches("text", ""), []);
  assert.deepEqual(findCodeMatches("text", "missing"), []);
  assert.deepEqual(findCodeMatches("aaa", "aa"), [{ start: 0, end: 2 }]);
});
test("active search highlighting crosses syntax tokens without changing source or token colors", () => {
  const source = 'import flagquantum as fq\nprint("<value>")';
  const tokens = codeTokens(source, "python");
  const start = source.indexOf("as fq");
  const parts = markCodeMatch(tokens, start, start + 5);
  assert.equal(parts.map((part) => part.text).join(""), source);
  assert.equal(
    parts
      .filter((part) => part.matched)
      .map((part) => part.text)
      .join(""),
    "as fq",
  );
  assert.equal(parts.find((part) => part.text === "as").kind, "keyword");
  assert.equal(markCodeMatch(tokens, -1, -1), tokens);
  assert.equal(markCodeMatch(tokens, 0, 0), tokens);
});
