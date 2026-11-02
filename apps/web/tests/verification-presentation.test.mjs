import test from "node:test";
import assert from "node:assert/strict";
import {
  verificationLabel,
  verificationSummary,
} from "../src/state/verification-presentation.ts";
const report = (id, status, time = 1) => ({
  id,
  status,
  created_at: time,
  original_run: "version",
  source_hash: "source",
  differences: [],
});
test("an imported pass never counts as a check in the current environment", () => {
  const archived = [
    { key: "old", report: report("old", "exact"), validated_status: "exact" },
  ];
  const summary = verificationSummary([], archived, "version", "source");
  assert.equal(summary.currentPassed, 0);
  assert.equal(summary.archivedPassed, 1);
  assert.equal(summary.latest, undefined);
  assert.match(
    verificationLabel(archived[0].report, true),
    /^Archived verification/,
  );
  assert.doesNotMatch(
    verificationLabel(report("a", "prepared"), true),
    /ready for explicit/,
  );
});
test("the latest failed local attempt stays visible alongside an earlier passing attempt", () => {
  const summary = verificationSummary(
    [
      report("pass", "exact", 1),
      report("failure", "failed", 2),
      { ...report("unrelated", "exact", 3), source_hash: "different" },
    ],
    [],
    "version",
    "source",
  );
  assert.equal(summary.currentPassed, 1);
  assert.equal(summary.local.length, 2);
  assert.equal(summary.latest.status, "failed");
  assert.match(verificationLabel(summary.latest), /Reproduction failed/);
});
