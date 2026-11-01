import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function assessProductAcceptance(
  contract,
  browser,
  sdk,
  revision = "local-working-tree",
) {
  const errors = [];
  const all = [];
  function visit(suite) {
    for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
      if (!Array.isArray(spec?.tests)) {
        errors.push("Malformed browser test evidence.");
        continue;
      }
      for (const test of spec.tests) all.push({ title: spec.title, test });
    }
    for (const child of Array.isArray(suite?.suites) ? suite.suites : [])
      visit(child);
  }
  visit(browser || {});
  const passed = ({ test }) =>
    test?.expectedStatus === "passed" &&
    test.status === "expected" &&
    Array.isArray(test.results) &&
    test.results.length === 1 &&
    test.results.every(
      (result) => result?.status === "passed" && result.retry === 0,
    );
  if (!all.length) errors.push("No browser tests were collected.");
  if (
    browser?.config?.metadata?.revision !== revision ||
    sdk?.revision !== revision
  )
    errors.push("Acceptance evidence does not match the current revision.");
  if (!Array.isArray(browser?.errors) || browser.errors.length)
    errors.push("Browser runner reported global errors.");
  if (all.some((item) => !passed(item)))
    errors.push(
      "Browser tests contain failures, skips, retries or unexpected outcomes.",
    );
  const journeys = contract.journeys.map((journey) => {
    const tests = journey.required_tests.map((title) => {
      const matches = all.filter((item) => item.title === title);
      return { title, passed: matches.length === 1 && passed(matches[0]) };
    });
    return {
      id: journey.id,
      name: journey.name,
      passed: tests.every((test) => test.passed),
      tests,
    };
  });
  if (journeys.some((journey) => !journey.passed))
    errors.push("Required user journeys lack complete passing evidence.");
  if (
    !sdk ||
    sdk.sdk_version !== contract.sdk.version ||
    sdk.torch_version?.split("+")[0] !== contract.sdk.torch_version ||
    !Number.isInteger(sdk.tests) ||
    sdk.tests < contract.sdk.minimum_tests ||
    !Array.isArray(sdk.skipped) ||
    sdk.skipped.length ||
    sdk.failures !== 0 ||
    sdk.errors !== 0
  )
    errors.push(
      "Pinned real SDK acceptance is missing, incomplete, skipped or failed.",
    );
  return {
    schema: "flagqai.web-product-acceptance.v1",
    automated_acceptance: errors.length ? "failed" : "passed",
    // These unverified product gates are deliberately not certified by CI.
    product_readiness: "incomplete",
    release_authorized: false,
    journeys,
    browser_tests: all.length,
    sdk_tests: sdk?.tests || 0,
    errors,
    pending_product_gates: contract.pending_product_gates,
  };
}

async function main() {
  const root = new URL("../", import.meta.url);
  const contract = JSON.parse(
    await readFile(new URL("acceptance/product-contract.json", root), "utf8"),
  );
  const evidence = {};
  async function load(name, path) {
    try {
      const bytes = await readFile(new URL(path, root));
      evidence[name] = {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      evidence[name] = { path, unavailable: true };
      return null;
    }
  }
  const [browser, sdk] = await Promise.all([
    load("browser", "sdk-results/browser.json"),
    load("sdk", "sdk-results/acceptance.json"),
  ]);
  const revision = process.env.GITHUB_SHA || "local-working-tree";
  const report = {
    ...assessProductAcceptance(contract, browser, sdk, revision),
    generated_at: new Date().toISOString(),
    revision,
    evidence,
  };
  const output = new URL("sdk-results/product-acceptance.json", root);
  await mkdir(dirname(fileURLToPath(output)), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Product journey acceptance: ${report.automated_acceptance}; ${report.browser_tests} browser tests, ${report.sdk_tests} SDK tests. Product readiness remains incomplete.`,
  );
  for (const error of report.errors) console.error(error);
  if (report.automated_acceptance !== "passed") process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
