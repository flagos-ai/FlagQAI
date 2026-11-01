import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessProductAcceptance } from "../scripts/product-acceptance.mjs";
const contract = JSON.parse(
  readFileSync(
    new URL("../acceptance/product-contract.json", import.meta.url),
    "utf8",
  ),
);
function evidence() {
  return {
    browser: {
      config: { metadata: { revision: "checked-revision" } },
      errors: [],
      suites: [
        {
          specs: contract.journeys
            .flatMap((journey) => journey.required_tests)
            .map((title) => ({
              title,
              tests: [
                {
                  expectedStatus: "passed",
                  status: "expected",
                  results: [{ status: "passed", retry: 0 }],
                },
              ],
            })),
        },
      ],
    },
    sdk: {
      revision: "checked-revision",
      sdk_version: "0.4.0",
      torch_version: "2.13.0+cpu",
      tests: 92,
      skipped: [],
      errors: 0,
      failures: 0,
    },
  };
}
const assess = ({ browser, sdk }) =>
  assessProductAcceptance(contract, browser, sdk, "checked-revision");
test("complete journey evidence passes automation without certifying independent product gates", () => {
  const report = assess(evidence());
  assert.equal(report.automated_acceptance, "passed");
  assert.equal(report.journeys.length, 3);
  assert.ok(report.journeys.every((journey) => journey.passed));
  assert.equal(report.release_authorized, false);
  assert.equal(report.product_readiness, "incomplete");
  assert.ok(
    report.pending_product_gates.every(
      (gate) => gate.status === "not_verified",
    ),
  );
});
test("missing, skipped, retried, malformed or stale browser evidence cannot certify a journey", () => {
  for (const change of [
    (data) => data.browser.suites[0].specs.pop(),
    (data) => {
      data.browser.suites[0].specs[0].tests[0].results[0].status = "skipped";
    },
    (data) => {
      data.browser.suites[0].specs[0].tests[0].results[0].retry = 1;
    },
    (data) => {
      data.browser.errors.push({ message: "Runner crashed" });
    },
    (data) => {
      data.browser.config.metadata.revision = "older-revision";
    },
    (data) => {
      data.browser.suites[0].specs[0].tests = null;
    },
    (data) => {
      data.browser.suites = [];
    },
  ]) {
    const data = evidence();
    change(data);
    assert.equal(assess(data).automated_acceptance, "failed");
  }
});
test("real SDK evidence must include the pinned runtime, full baseline and zero skips", () => {
  for (const change of [
    (data) => {
      data.sdk = null;
    },
    (data) => {
      data.sdk.revision = "older-revision";
    },
    (data) => {
      data.sdk.sdk_version = "test-only";
    },
    (data) => {
      data.sdk.tests = 0;
    },
    (data) => {
      data.sdk.tests = 91;
    },
    (data) => {
      data.sdk.errors = 1;
    },
    (data) => {
      data.sdk.skipped = [{ reason: "SDK unavailable" }];
    },
  ]) {
    const data = evidence();
    change(data);
    assert.equal(assess(data).automated_acceptance, "failed");
  }
});
test("each browser case belongs to one journey and every literal acceptance case is covered", () => {
  const titles = contract.journeys.flatMap((journey) => journey.required_tests);
  assert.equal(new Set(titles).size, titles.length);
  const source = readFileSync(
    new URL("../e2e/workbench.spec.mjs", import.meta.url),
    "utf8",
  );
  const literals = [...source.matchAll(/test\(\s*"([^"\n]+)"/g)].map(
    (match) => match[1],
  );
  for (const title of literals)
    assert.ok(titles.includes(title), `Journey mapping missing: ${title}`);
  assert.equal(
    titles.length,
    literals.length + 4,
    "Four real SDK examples must also be required",
  );
});
