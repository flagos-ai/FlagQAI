import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(
    new URL("../src/data/notebook-catalog.json", import.meta.url),
    "utf8",
  ),
);
const notebook = catalog.entries.find((item) =>
  item.path.includes("cooling_systems_optimization/overview"),
);
test("cooling notebook exposes imported quantum implementation without editing cells or running code", async ({
  page,
}, testInfo) => {
  const source =
    "from examples.synthesis.applications.automotive.cooling_systems_optimization.overview import quantum, workflow";
  let executions = 0;
  await page.route("**/api/notebook-sessions**", (route) => {
    if (route.request().url().endsWith("/execute")) executions++;
    return route.fulfill({
      json: {
        id: "a".repeat(32),
        notebook_id: notebook.id,
        title: notebook.title,
        revision: "v1",
        kernel: "idle",
        cells: [{ id: "import", cell_type: "code", source }],
        runs: [],
      },
    });
  });
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        "fq-notebook-editor-v1",
        JSON.stringify({ active: true, id }),
      ),
    notebook.id,
  );
  await page.goto("/#model");
  await page
    .getByRole("button", { name: "Read imported implementation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "FlagQuantum implementation",
  });
  await expect(
    dialog
      .getByRole("button", {
        name: /quantum.py Quantum construction · Imported by this cell/,
      })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator(".fq-notebook-sdk-references")).toContainText(
    "flagquantum.Circuit",
  );
  await expect(dialog.locator("pre").first()).toContainText(
    "def thermal_encoding",
  );
  await dialog.getByRole("button", { name: /^workflow.py/ }).click();
  await expect(dialog.locator(".fq-notebook-source-path")).toContainText(
    "/workflow.py",
  );
  await page.screenshot({
    path: testInfo.outputPath("notebook-implementation.png"),
  });
  await dialog.getByRole("button", { name: "Close implementation" }).click();
  await expect(
    page.getByRole("region", { name: "code cell 1", exact: true }),
  ).toContainText("cooling_systems_optimization");
  expect(executions).toBe(0);
});
