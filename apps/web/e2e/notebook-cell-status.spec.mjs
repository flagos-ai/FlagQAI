import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(
    new URL("../src/data/notebook-catalog.json", import.meta.url),
    "utf8",
  ),
);
const notebook = catalog.entries.find(
  (item) => item.path === "community/basic_examples/superposition",
);

test("cell status separates execution state from retained output provenance", async ({
  page,
}) => {
  const cells = [
    "current",
    "previous",
    "changed",
    "failed",
    "imported",
    "idle",
  ].map((id) => ({
    id,
    cell_type: "code",
    source: `# ${id}`,
    ...(id === "imported"
      ? {
          notebook: {
            source: "# imported",
            outputs: [{ output_type: "stream", text: "Imported result" }],
          },
        }
      : {}),
  }));
  const session = {
    id: "a".repeat(32),
    notebook_id: notebook.id,
    title: "Execution status preview",
    revision: "v1",
    kernel: "idle",
    kernel_id: "current-kernel",
    cells,
    runs: ["current", "previous", "changed", "failed"].map((id, i) => ({
      id: id + "-run",
      revision: "v1",
      kernel_id: id === "previous" ? "old-kernel" : "current-kernel",
      status: id === "failed" ? "failed" : "completed",
      cells: [
        {
          id,
          source: id === "changed" ? "# old code" : `# ${id}`,
          status: id === "failed" ? "failed" : "completed",
          execution_count: i + 1,
          outputs: [],
        },
      ],
    })),
  };
  await page.route("**/api/notebook-sessions**", (route) =>
    route.fulfill({ json: session }),
  );
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        "fq-notebook-editor-v1",
        JSON.stringify({ active: true, id }),
      ),
    notebook.id,
  );
  await page.goto("/#model");
  const cell = (i) =>
    page.getByRole("region", { name: `code cell ${i}`, exact: true });
  await expect(cell(1).locator(".fq-notebook-status-badge")).toHaveText(
    "Completed",
  );
  await expect(cell(1).locator(".fq-notebook-output-origin")).toHaveCount(0);
  await expect(cell(2).locator(".fq-notebook-output-origin")).toHaveText(
    "Previous kernel",
  );
  await expect(
    cell(2).getByLabel("Execution count 2", { exact: true }),
  ).toHaveText("[2]");
  await expect(cell(3).locator(".fq-notebook-status-badge")).toHaveText(
    "Code changed",
  );
  await expect(cell(3).locator(".fq-notebook-output-origin")).toHaveText(
    "Previous output",
  );
  await expect(cell(4).locator(".fq-notebook-status-badge")).toHaveText(
    "Failed",
  );
  await expect(cell(5).locator(".fq-notebook-output-origin")).toHaveText(
    "Not verified here",
  );
  await expect(cell(6).locator(".fq-notebook-status-badge")).toHaveText(
    "Not run",
  );
  await page.screenshot({ path: "/private/tmp/flagqai-notebook-status.png" });
});
