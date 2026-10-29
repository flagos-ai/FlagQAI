import test from "node:test";
import assert from "node:assert/strict";
import {
  toggleLineComments as toggle,
  isCommentShortcut,
} from "../src/state/editor-comments.ts";
test("current-line comments preserve indentation, caret and reversibility in both languages", () => {
  for (const language of ["python", "qasm"]) {
    const source = "    circuit.h(0)\nnext",
      prefix = language === "python" ? "# " : "// ";
    const changed = toggle(source, 9, 9, language);
    assert.equal(changed.source, "    " + prefix + "circuit.h(0)\nnext");
    assert.equal(changed.start, 9 + prefix.length);
    const restored = toggle(
      changed.source,
      changed.start,
      changed.end,
      language,
    );
    assert.equal(restored.source, source);
    assert.equal(restored.start, 9);
  }
});
test("multiline selections exclude a following line when ending at its start and retain blank lines", () => {
  const source = "  a\n\n    b\nuntouched";
  const edit = toggle(source, 0, source.indexOf("untouched"), "python");
  assert.equal(edit.source, "  # a\n\n    # b\nuntouched");
  assert.equal(
    toggle(edit.source, edit.start, edit.end, "python").source,
    source,
  );
});
test("mixed commented selections become wholly commented and undo restores existing comments exactly", () => {
  const source = "# explanation\nrun()";
  const edit = toggle(source, 0, source.length, "python");
  assert.equal(edit.source, "# # explanation\n# run()");
  assert.equal(
    toggle(edit.source, edit.start, edit.end, "python").source,
    source,
  );
  assert.equal(
    toggle("  //old\n\t// next", 0, 18, "qasm").source,
    "  old\n\tnext",
  );
});
test("empty lines, trailing newline carets, CRLF and caret-inside-prefix mapping remain valid", () => {
  assert.equal(toggle("", 0, 0, "python").source, "# ");
  assert.equal(toggle("a\n", 2, 2, "qasm").source, "a\n// ");
  const source = "a\r\nb\r\n";
  const edit = toggle(source, 0, source.length, "qasm");
  assert.equal(edit.source, "// a\r\n// b\r\n");
  assert.equal(
    toggle(edit.source, edit.start, edit.end, "qasm").source,
    source,
  );
  const removed = toggle("  # text", 3, 3, "python");
  assert.equal(removed.source, "  text");
  assert.equal(removed.start, 2);
});
test("only the comment shortcut is intercepted, with IME and alternate shortcuts preserved", () => {
  const event = {
    key: "/",
    code: "Slash",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };
  assert.equal(isCommentShortcut(event), true);
  assert.equal(
    isCommentShortcut({ ...event, metaKey: false, ctrlKey: true }),
    true,
  );
  for (const extra of [
    { metaKey: false },
    { altKey: true },
    { isComposing: true },
    { key: "?", shiftKey: true },
  ])
    assert.equal(isCommentShortcut({ ...event, ...extra }), false);
  assert.equal(
    isCommentShortcut({ ...event, key: "/", code: "Digit7", shiftKey: true }),
    true,
  );
});
