import { test, expect } from "@playwright/test";

const draft = "# Preserve my unsaved research\nprint('draft')\n";
const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });

test("official notebook reading and lost copy receipt preserve drafts and submit one project", async ({
  page,
}) => {
  const compatible = process.env.FQ_NOTEBOOK_SDK === "compatible";
  await page.goto("/#model");
  const baselineRuns = new Set(
    (await page.request.get("/api/python/runs").then((r) => r.json())).map(
      (run) => run.id,
    ),
  );
  const baselineProjects = new Set(
    (
      await page.request.get("/api/projects").then((r) => r.json())
    ).projects.map((project) => project.id),
  );
  const createdRuns = async () =>
    (await page.request.get("/api/python/runs").then((r) => r.json())).filter(
      (run) => !baselineRuns.has(run.id),
    );
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search models" })
    .fill("superposition");
  await page
    .getByRole("region", { name: "Official notebooks" })
    .getByRole("button", { name: /Superposition in native FlagQuantum/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Superposition in native FlagQuantum",
  });
  await expect(
    dialog.getByRole("button", { name: "Create research copy" }),
  ).toBeEnabled();
  await expect(
    dialog
      .getByRole("heading", { name: "Superposition in native FlagQuantum" })
      .first(),
  ).toBeVisible();
  await expect(dialog.locator(".fq-notebook-cell")).not.toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Check environment", exact: true })
    .click();
  await expect(
    dialog.getByRole("status", { name: "Notebook environment status" }),
  ).toHaveText(
    compatible ? "Required imports and SDK APIs available" : "SDK incompatible",
    { timeout: 45000 },
  );
  if (!compatible) {
    await expect(
      dialog.getByText("Prepare environment", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(/Use a verified SDK build/)).toBeVisible();
  }
  expect(await dialog.locator("script, iframe").count()).toBe(0);
  expect(await createdRuns()).toHaveLength(0);
  await page.setViewportSize({ width: 520, height: 700 });
  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pages = element.querySelector(".fq-notebook-pages");
    return {
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      contentHeight: pages.clientHeight,
      scrollHeight: pages.scrollHeight,
    };
  });
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(700);
  expect(layout.width).toBeLessThanOrEqual(520);
  expect(layout.contentHeight).toBeGreaterThan(150);
  expect(layout.scrollHeight).toBeGreaterThan(layout.contentHeight);
  await expect(
    dialog.getByRole("button", { name: "Create research copy" }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/notebook-reader.png",
    fullPage: true,
  });
  let first = true;
  await page.route("**/api/projects/notebook", async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  });
  await dialog.getByRole("button", { name: "Create research copy" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Create research copy" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(editor(page)).toHaveValue(/runpy.run_module/);
  const projects = await page.request
    .get("/api/projects")
    .then((r) => r.json());
  expect(
    projects.projects.filter(
      (p) =>
        !baselineProjects.has(p.id) && p.path.startsWith("notebook-copies/"),
    ),
  ).toHaveLength(1);
  await page.reload();
  await expect(editor(page)).toHaveValue(/runpy.run_module/);
  const stored = await page.evaluate(() =>
    Object.values(localStorage).some((value) =>
      value.includes("Preserve my unsaved research"),
    ),
  );
  expect(stored).toBeTruthy();
  await page.getByRole("button", { name: /^(Run Python|Save & run)$/ }).click();
  if (!compatible) {
    await expect(
      page.getByText(
        /Notebook environment check:.*No research code was executed/,
      ),
    ).toBeVisible({ timeout: 45000 });
    expect(await createdRuns()).toHaveLength(0);
    await expect(editor(page)).toHaveValue(/runpy.run_module/);
    return;
  }
  await expect
    .poll(
      async () => {
        const runs = await createdRuns();
        return runs[0]?.status;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
  const runs = await createdRuns();
  expect(runs).toHaveLength(1);
  const result = await page.request
    .get(`/api/python/runs/${runs[0].id}`)
    .then((r) => r.json());
  expect(
    result.project.files.some((file) =>
      file.path.endsWith("superposition/main.py"),
    ),
  ).toBeTruthy();
  expect(
    result.experiments.some(
      (file) => file.filename === "last-observed-run.fqx",
    ),
  ).toBeTruthy();
  const evidence = page.locator(".fq-run-evidence").first();
  await evidence.getByText("Recorded run evidence", { exact: true }).click();
  await expect(evidence).toContainText("Required imports and SDK APIs checked");
  await expect(evidence).toContainText("not scientific validation");
  await expect(evidence).toContainText(
    result.project.snapshot_hash.slice(0, 12),
  );
  const record = await page.request.get(
    `/api/python/runs/${result.id}/evidence`,
  );
  expect(record.ok()).toBeTruthy();
  const downloaded = await record.json();
  expect(downloaded.run.id).toBe(result.id);
  expect(downloaded.inputs.files[downloaded.inputs.entry]).toBe(result.source);
  expect(Object.keys(downloaded.inputs.files).sort()).toEqual(
    result.project.files.map((file) => file.path).sort(),
  );
  const checks = evidence.getByRole("region", {
    name: "Recorded input environment checks",
  });
  await expect(checks).toContainText("No later environment check recorded");
  await checks
    .getByRole("button", {
      name: "Recheck environment",
    })
    .click();
  await expect(checks.getByRole("status")).toHaveText(
    /Required imports and SDK APIs available.*checked this service session/,
    { timeout: 45000 },
  );
  const checkedRecord = await page.request
    .get(`/api/python/runs/${result.id}/evidence`)
    .then((r) => r.json());
  expect(checkedRecord.environment_checks).toHaveLength(1);
  expect(checkedRecord.environment_checks[0].source_hash).toBe(
    result.project.snapshot_hash,
  );
  expect(checkedRecord.environment_checks[0].research_executed).toBe(false);
  expect(checkedRecord.run).toEqual(downloaded.run);
  expect(await createdRuns()).toHaveLength(1);
  await page.reload();
  await expect(editor(page)).toHaveValue(/runpy.run_module/);
  await page
    .locator(".fq-run-evidence")
    .first()
    .getByText("Recorded run evidence", { exact: true })
    .click();
  await expect(page.locator(".fq-run-evidence").first()).toContainText(
    result.project.snapshot_hash.slice(0, 12),
  );
  const restoredChecks = page.getByRole("region", {
    name: "Recorded input environment checks",
  });
  await expect(restoredChecks).toContainText("checked this service session");
  await restoredChecks
    .getByText("Environment check history · 1", { exact: true })
    .click();
  await expect(restoredChecks).toContainText("ready · local");
  expect(await createdRuns()).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes("Preserve my unsaved research"),
      ),
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "View result ↗", exact: true })
    .first()
    .click();
  await page.getByLabel("Run details and provenance").click();
  const resultEvidence = page.locator(".fq-run-evidence");
  await resultEvidence
    .getByText("Recorded run evidence", { exact: true })
    .click();
  await expect(resultEvidence).toContainText(
    result.project.snapshot_hash.slice(0, 12),
  );
  await expect(
    resultEvidence.getByRole("link", {
      name: "last-observed-run.fqx",
      exact: true,
    }),
  ).toBeVisible();
  const savedChecks = resultEvidence.getByRole("region", {
    name: "Recorded input environment checks",
  });
  await expect(savedChecks).toContainText("checked this service session");
  await savedChecks.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/notebook-run-evidence.png",
    fullPage: true,
  });
  expect(await createdRuns()).toHaveLength(1);
});
