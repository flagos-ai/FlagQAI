import { test, expect } from "@playwright/test";
import { writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });
const draft = "# Newer unsaved draft — preserve this\nprint('my work')\n";
const bell = `import flagquantum as fq
circuit = fq.Circuit(2).h(0).cx(0, 1)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
fq.save("bell.fqx", result.plan, result=result)
print(result.counts)
`;
async function showJobEvidence(page) {
  const result = page.getByRole("region", { name: "Job results", exact: true });
  await result.getByRole("button", { name: "Table", exact: true }).click();
  const disclosure = result.locator("details.fq-job-provenance");
  if ((await disclosure.getAttribute("open")) === null)
    await result
      .getByLabel("Run details and provenance", { exact: true })
      .click();
  return result;
}
async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function runPython(page, source) {
  const before = new Set(
    (await get(page, "/api/python/runs")).map((run) => run.id),
  );
  if (source !== undefined) await editor(page).fill(source);
  await page
    .getByRole("button", { name: /^(Run Python|Save & run)$/, exact: true })
    .click();
  let run;
  await expect
    .poll(
      async () => {
        const newest = (await get(page, "/api/python/runs")).find(
          (item) => !before.has(item.id),
        );
        if (!newest) return "not submitted";
        run = await get(page, "/api/python/runs/" + newest.id);
        return run.status;
      },
      { timeout: 90000 },
    )
    .not.toMatch(/^(not submitted|queued|running)$/);
  await expect(page.getByLabel("Python run history")).toHaveValue(run.id);
  return run;
}
async function savedRecord(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  expect(reference).toBeTruthy();
  const record = await get(page, "/api/experiments/" + reference.id);
  expect(record.program.origin.run_id).toBe(run.id);
  expect(record.program.origin.source).toBe(run.source);
  expect(record.program.origin.source_hash).toBe(run.source_hash);
  expect(record.program.experiment.sha256).toBe(reference.sha256);
  return record;
}
async function openProgramMetadata(page) {
  const details = page.locator(".fq-program-metadata");
  await expect(details).toBeVisible();
  if (!(await details.evaluate((element) => element.open)))
    await details.locator(":scope > summary").click();
}
async function openCircuit(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  await page
    .getByRole("group", { name: reference.filename, exact: true })
    .getByRole("button", { name: "View circuit ↗" })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await openProgramMetadata(page);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await expect(
    page.getByText("· run " + run.id.slice(0, 8), { exact: false }),
  ).toBeVisible();
  await page.locator(".fq-program-metadata > summary").click();
  return reference;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#model");
  await expect(editor(page)).toBeVisible();
});

test("flat 16-qubit circuit exposes gate ranges instead of one ungrouped block", async ({
  page,
}, testInfo) => {
  const previousRuns = (await get(page, "/api/python/runs")).map((r) => r.id);
  const run = await runPython(
    page,
    `import flagquantum as fq
circuit = fq.Circuit(16)
for i in range(81):
    circuit.cx(i % 16, (i + 1) % 16)
fq.save("flat81.fqx", fq.compile(circuit))
`,
  );
  await editor(page).fill(draft);
  await openCircuit(page, run, "flat81.fqx");
  const detail = page.getByRole("combobox", {
    name: "Circuit detail",
    exact: true,
  });
  await expect(detail).toHaveValue("1");
  await detail.selectOption("1");
  await expect(page.locator('[data-module-frame="ungrouped"]')).toHaveCount(0);
  await expect(page.locator("[data-module-frame]")).toHaveCount(6);
  await expect(page.getByText("Gate sequence", { exact: true })).toBeVisible();
  const range = page.getByRole("button", {
    name: "Select Gates 1–14",
    exact: true,
  });
  await range.focus();
  await range.press("Enter");
  await expect(range).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fq-node-details h3")).toHaveText("Gates 1–14");
  expect(
    await page
      .locator("[data-module-frame]")
      .first()
      .evaluate((el) => Number(el.getAttribute("height"))),
  ).toBeLessThan(140);
  await page
    .getByRole("button", { name: "Expand Gates 1–14", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand Gates 1–7", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand Gates 1–7", exact: true })
    .click();
  await expect(page.locator(".fq-circuit-symbol")).toHaveCount(7);
  await detail.selectOption("3");
  await expect(page.locator(".fq-circuit-symbol")).toHaveCount(0);
  await detail.selectOption("100");
  await expect(page.locator(".fq-circuit-symbol")).toHaveCount(81);
  await detail.selectOption("1");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("gate-ranges.png") });
  const record = await savedRecord(page, run, "flat81.fqx");
  expect(record.program.experiment.sha256).toBe(run.experiments[0].sha256);
  expect((await get(page, "/api/python/runs")).map((r) => r.id).sort()).toEqual(
    [...previousRuns, run.id].sort(),
  );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});
