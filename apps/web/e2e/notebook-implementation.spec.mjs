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
test("opening an expanded copy preserves the original workspace and bundles its helpers", async ({
  page,
}) => {
  const retained = {
    id: "f".repeat(32),
    cells: [
      {
        id: "old-cell",
        cell_type: "code",
        source: "# retained cooling research",
      },
    ],
  };
  const key = "fq-notebook-workspace-v1:" + notebook.id;
  await page.addInitScript(
    ({ key, retained }) => localStorage.setItem(key, JSON.stringify(retained)),
    { key, retained },
  );
  let executions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/execute")) executions++;
  });
  await page.goto("/#model");
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search models" })
    .fill("Cooling-system");
  await page
    .getByRole("region", { name: "Official notebooks" })
    .getByRole("button", { name: /Cooling-system optimization/ })
    .click();
  const original = page.getByRole("link", {
    name: "Download original notebook",
  });
  const upstream = await page.request.get(await original.getAttribute("href"));
  expect(upstream.ok()).toBe(true);
  expect((await upstream.json()).nbformat).toBe(4);
  await page
    .getByRole("button", { name: "Open expanded copy", exact: true })
    .click();
  const workspace = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(workspace).toContainText(
    "from thermal model to quantum execution",
  );
  await expect(workspace).toContainText("from notebook_inputs import prepare");
  await expect(
    workspace.getByRole("button", {
      name: "How this notebook uses FlagQuantum",
      exact: true,
    }),
  ).toBeVisible();
  const selected = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fq-notebook-editor-v1")),
  );
  expect(selected.id).toMatch(/^import:[a-f0-9]{32}$/);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key),
  ).toEqual(retained);
  await page.reload();
  await expect(workspace).toContainText(
    "from thermal model to quantum execution",
  );
  expect(executions).toBe(0);
});
test("expanded cooling cells expose construction and execution without automatically running or replacing a draft", async ({
  page,
}) => {
  const document = JSON.parse(
    await readFile(
      new URL(`../public/notebooks/${notebook.id}.ipynb`, import.meta.url),
      "utf8",
    ),
  );
  const draft = "\n# retained research draft";
  let executions = 0;
  const cells = document.cells.map((cell) => ({
    ...cell,
    source: cell.source.join(""),
  }));
  cells[2].source += draft;
  await page.route("**/api/notebook-sessions**", (route) => {
    if (route.request().url().endsWith("/execute")) executions++;
    return route.fulfill({
      json: {
        id: "a".repeat(32),
        notebook_id: notebook.id,
        title: notebook.title,
        revision: "v1",
        kernel: "stopped",
        cells,
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
  await expect(
    page.getByText(
      "Cooling-system optimization: from thermal model to quantum execution",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "code cell 3", exact: true }),
  ).toContainText("retained research draft");
  const text = await page.locator(".fq-notebook-workspace").textContent();
  for (const source of [
    "def thermal_encoding",
    "synth.synthesize",
    "fq.run(inverse)",
    "bind_parameters",
    "fq.save(",
  ])
    expect(text).toContain(source);
  await page.screenshot({ path: "/private/tmp/flagqai-cooling-expanded.png" });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "code cell 3", exact: true }),
  ).toContainText("retained research draft");
  expect(executions).toBe(0);
});
test("cooling notebook exposes imported quantum implementation without editing cells or running code", async ({
  page,
}) => {
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
    path: "/private/tmp/flagqai-notebook-implementation.png",
  });
  await dialog.getByRole("button", { name: "Close implementation" }).click();
  await expect(
    page.getByRole("region", { name: "code cell 1", exact: true }),
  ).toContainText("cooling_systems_optimization");
  expect(executions).toBe(0);
});
