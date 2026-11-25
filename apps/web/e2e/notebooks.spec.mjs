import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const path =
  "applications/automotive/cooling_systems_optimization/overview/walkthrough.ipynb";
const catalog = JSON.parse(
  await readFile(new URL("../src/data/notebook-catalog.json", import.meta.url)),
);
const notebook = catalog.entries.find(
  (item) => path === item.path + "/walkthrough.ipynb",
);
const raw = JSON.parse(
  await readFile(
    new URL(`../public/notebooks/${notebook.id}.ipynb`, import.meta.url),
  ),
);

test("raw notebook opens directly and reuses edited session across file switches and refresh", async ({
  page,
}, testInfo) => {
  let executions = 0;
  let copies = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url().endsWith("/execute")) executions++;
    if (request.url().endsWith("/api/notebook-sessions")) copies++;
  });
  const old = JSON.stringify({
    id: "f".repeat(32),
    cells: [
      { id: "retained", cell_type: "code", source: "# older canonical draft" },
    ],
  });
  await page.addInitScript(
    ({ id, old }) => {
      if (!localStorage.getItem("fq-notebook-workspace-v1:" + id))
        localStorage.setItem("fq-notebook-workspace-v1:" + id, old);
    },
    { id: notebook.id, old },
  );
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await editor.fill("# keep Python draft");
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search models" });
  const tree = page.getByRole("region", {
    name: "FlagQuantum synthesis files",
  });
  await search.fill(path);
  await tree.getByRole("button", { name: path, exact: true }).click();
  const workspace = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(workspace.locator(".fq-notebook-edit-cell")).toHaveCount(
    raw.cells.length,
  );
  await expect(
    page.getByRole("button", { name: "Notebook example", exact: true }),
  ).toContainText(notebook.title);
  const firstCode = workspace
    .locator(".fq-notebook-edit-cell textarea")
    .first();
  await expect(firstCode).toHaveValue(
    raw.cells.find((cell) => cell.cell_type === "code").source.join(""),
  );
  const selected = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fq-notebook-editor-v1")).id,
  );
  expect(selected).toMatch(/^import:[a-f0-9]{32}$/);
  await firstCode.fill("# keep Notebook draft");
  await page.waitForTimeout(800);
  await search.fill("community/basic_examples/superposition/main.py");
  await tree
    .getByRole("button", {
      name: "community/basic_examples/superposition/main.py",
      exact: true,
    })
    .click();
  await expect(editor).toBeVisible();
  await search.fill(path);
  await tree.getByRole("button", { name: path, exact: true }).click();
  await expect(firstCode).toHaveValue("# keep Notebook draft");
  await page.reload();
  await expect(firstCode).toHaveValue("# keep Notebook draft");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("fq-notebook-editor-v1")).id,
    ),
  ).toBe(selected);
  expect(
    await page.evaluate(
      (id) => localStorage.getItem("fq-notebook-workspace-v1:" + id),
      notebook.id,
    ),
  ).toBe(old);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes("keep Python draft"),
      ),
    ),
  ).toBe(true);
  expect(copies).toBe(2);
  expect(executions).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("synthesis-original-notebook.png"),
  });
});
