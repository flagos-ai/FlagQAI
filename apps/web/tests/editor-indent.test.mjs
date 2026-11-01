import test from "node:test";
import assert from "node:assert/strict";
import {
  indentSelection as indent,
  isIndentShortcut,
} from "../src/state/editor-indent.ts";

test("block indent preserves code, blank lines, CRLF and the next unselected line", () => {
  const source = "α()\r\n\r\n  β()\r\nuntouched";
  const end = source.indexOf("untouched");
  const edit = indent(source, 0, end);
  assert.equal(edit.source, "    α()\r\n    \r\n      β()\r\nuntouched");
  assert.equal(edit.start, 4);
  assert.equal(edit.end, end + 12);
  assert.deepEqual(indent(edit.source, edit.start, edit.end, true), {
    source,
    start: 0,
    end,
  });
});

test("caret indentation inserts spaces; reverse indentation maps carets and mixed prefixes", () => {
  assert.deepEqual(indent("ab", 1, 1), { source: "a    b", start: 5, end: 5 });
  assert.deepEqual(indent("  abc", 1, 1, true), {
    source: "abc",
    start: 0,
    end: 0,
  });
  assert.deepEqual(indent("\tabc", 3, 3, true), {
    source: "abc",
    start: 2,
    end: 2,
  });
  const source = "\ta\n  b\n      c\nd";
  assert.equal(indent(source, 0, source.length, true).source, "a\nb\n  c\nd");
  assert.deepEqual(indent("abc", 2, 2, true), {
    source: "abc",
    start: 2,
    end: 2,
  });
  assert.deepEqual(indent("", 0, 0), { source: "    ", start: 4, end: 4 });
});

test("partial selections indent whole lines without replacing selected content", () => {
  const edit = indent("hello\nworld\n", 2, 8);
  assert.equal(edit.source, "    hello\n    world\n");
  assert.equal(edit.start, 6);
  assert.equal(edit.end, 16);
  assert.deepEqual(indent(edit.source, edit.start, edit.end, true), {
    source: "hello\nworld\n",
    start: 2,
    end: 8,
  });
});

test("indentation leaves browser modifier shortcuts and IME composition alone", () => {
  const event = { key: "Tab", ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(isIndentShortcut(event), true);
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { key: "Enter" },
  ])
    assert.equal(isIndentShortcut({ ...event, ...extra }), false);
});
