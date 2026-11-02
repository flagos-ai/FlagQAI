import test from "node:test";
import assert from "node:assert/strict";
import {
  fitCircuitZoom,
  circuitZoomScroll,
} from "../src/state/circuit-viewport.ts";

test("fit respects both viewport dimensions and existing zoom limits", () => {
  assert.equal(fitCircuitZoom(200, 2000, 800, 400), 18);
  assert.equal(fitCircuitZoom(2000, 200, 400, 800), 18);
  assert.equal(fitCircuitZoom(10, 10, 800, 400), 180);
  assert.equal(fitCircuitZoom(100000, 100000, 400, 400), 10);
});

test("zoom retains the SVG point at the padded viewport center and clamps outer edges", () => {
  const view = {
    left: 200,
    top: 100,
    width: 600,
    height: 400,
    paddingLeft: 10,
    paddingTop: 30,
  };
  const scaled = circuitZoomScroll(view, 90, 135);
  assert.equal(
    ((scaled.left + view.width / 2 - view.paddingLeft) * 90) / 135,
    view.left + view.width / 2 - view.paddingLeft,
  );
  assert.equal(
    ((scaled.top + view.height / 2 - view.paddingTop) * 90) / 135,
    view.top + view.height / 2 - view.paddingTop,
  );
  assert.deepEqual(circuitZoomScroll({ ...view, ...scaled }, 135, 90), {
    left: view.left,
    top: view.top,
  });
  assert.deepEqual(circuitZoomScroll({ ...view, left: 0, top: 0 }, 90, 10), {
    left: 0,
    top: 0,
  });
});
