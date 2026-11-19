import { test, expect } from "@playwright/test";

const draft = "# Preserve my unsaved research\nprint('draft')\n";
const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });

test("official notebook reading and lost copy receipt preserve drafts and submit one project", async ({
  page,
}) => {
  await page.goto("/#model");
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
  expect(await dialog.locator("script, iframe").count()).toBe(0);
  expect(
    await page.request.get("/api/python/runs").then((r) => r.json()),
  ).toHaveLength(0);
  await page.setViewportSize({ width: 520, height: 700 });
  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pages = element.querySelector('.fq-notebook-pages');
    return { top: rect.top, bottom: rect.bottom, width: rect.width,
      contentHeight: pages.clientHeight, scrollHeight: pages.scrollHeight };
  });
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(700);
  expect(layout.width).toBeLessThanOrEqual(520);
  expect(layout.contentHeight).toBeGreaterThan(150);
  expect(layout.scrollHeight).toBeGreaterThan(layout.contentHeight);
  await expect(dialog.getByRole('button', { name: 'Create research copy' })).toBeInViewport();
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
    projects.projects.filter((p) => p.path.startsWith("notebook-copies/")),
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
  await expect
    .poll(
      async () => {
        const runs = await page.request
          .get("/api/python/runs")
          .then((r) => r.json());
        return runs[0]?.status;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
  const runs = await page.request.get("/api/python/runs").then((r) => r.json());
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
});
