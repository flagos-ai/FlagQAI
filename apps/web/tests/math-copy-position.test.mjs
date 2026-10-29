import test from "node:test";
import assert from "node:assert/strict";
import { mathCopyPosition } from "../src/state/math-copy-position.ts";
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const viewport = rect(100, 100, 400, 500);
function assertFree(point, obstacles) {
  assert.ok(point);
  const box = rect(point.left, point.top, point.left + 26, point.top + 24);
  assert.ok(
    box.left >= viewport.left &&
      box.right <= viewport.right &&
      box.top >= viewport.top &&
      box.bottom <= viewport.bottom,
  );
  for (const r of obstacles)
    assert.ok(
      !(
        box.left < r.right + 3 &&
        box.right > r.left - 3 &&
        box.top < r.bottom + 3 &&
        box.bottom > r.top - 3
      ),
    );
}
test("hover copy action stays outside formula ink and neighboring table cells", () => {
  const anchor = rect(130, 160, 220, 185),
    neighbors = [anchor, rect(224, 160, 280, 185), rect(130, 190, 280, 215)];
  assertFree(mathCopyPosition(anchor, viewport, neighbors), neighbors);
});
test("edge and long formulas choose an in-bounds free position without reserving layout width", () => {
  for (const anchor of [
    rect(100, 100, 395, 150),
    rect(350, 460, 400, 495),
    rect(100, 220, 400, 280),
  ])
    assertFree(mathCopyPosition(anchor, viewport, [anchor]), [anchor]);
  assert.equal(mathCopyPosition(viewport, viewport, [viewport]), null);
});
