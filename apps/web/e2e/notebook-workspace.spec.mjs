import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("IPython cell workspace retains state, receipts, edits and output", async ({
  page,
}) => {
  await page.goto("/#model");
  const model = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await model.fill("# untouched model draft\nprint('keep me')");
  async function open() {
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search models" })
      .fill("superposition");
    await page
      .getByRole("region", { name: "Official notebooks" })
      .getByRole("button", { name: /Superposition in native FlagQuantum/ })
      .click();
    await page
      .getByRole("button", { name: "Open notebook workspace", exact: true })
      .click();
  }
  await open();
  const workspace = page.getByRole("dialog", { name: "Notebook workspace" });
  await expect(
    workspace.getByRole("button", { name: "Run all", exact: true }),
  ).toBeEnabled();
  while ((await workspace.locator(".fq-notebook-edit-cell").count()) > 1) {
    await workspace
      .getByRole("button", { name: /Delete cell/ })
      .last()
      .click();
  }
  await workspace
    .getByRole("button", { name: "+ Code cell", exact: true })
    .click();
  await workspace.getByRole("textbox").first().fill("# draft markdown");
  await workspace
    .getByRole("textbox")
    .last()
    .fill("value = 41\nprint('cell one ready')");
  let lost = false;
  await page.route("**/api/notebook-sessions/*/execute", async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await workspace
    .getByRole("button", { name: "Run cell 2", exact: true })
    .click();
  await expect(workspace).toContainText("cell one ready", { timeout: 45000 });
  await expect(workspace).toContainText("completed", { timeout: 45000 });
  await workspace
    .getByRole("button", { name: "+ Code cell", exact: true })
    .click();
  await workspace
    .getByRole("textbox")
    .last()
    .fill(
      "value += 1\nprint(value)\nfrom IPython.display import display\ndisplay({'answer': value})\nimport matplotlib.pyplot as plt\nplt.plot([0, 1], [value, value + 1])\nplt.show()",
    );
  await workspace
    .getByRole("button", { name: "Run cell 3", exact: true })
    .click();
  const output = workspace.getByLabel("Output cell 3", { exact: true });
  await expect(output).toContainText("42", { timeout: 45000 });
  await expect(output.getByRole("img", { name: "Cell output" })).toBeVisible();
  await workspace
    .getByRole("textbox")
    .last()
    .fill("print('unsaved cell draft')");
  await expect(workspace).toContainText("Code changed · previous output");
  await page.reload();
  await expect(model).toHaveValue("# untouched model draft\nprint('keep me')");
  await open();
  await expect(workspace.getByRole("textbox").last()).toHaveValue(
    "print('unsaved cell draft')",
  );
  await expect(workspace).toContainText("Execution history · 2");
  await workspace
    .getByRole("button", { name: "Restart kernel", exact: true })
    .click();
  await expect(workspace).toContainText("Kernel stopped");
  await workspace.getByRole("textbox").last().fill("print(value)");
  await workspace
    .getByRole("button", { name: "Run cell 3", exact: true })
    .click();
  await expect(
    workspace.getByLabel("Output cell 3", { exact: true }),
  ).toContainText("NameError", { timeout: 45000 });
  const download = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Download .ipynb", exact: true })
    .click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("research.ipynb");
  const exported = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(exported.nbformat).toBe(4);
  expect(exported.cells[2].source).toBe("print(value)");
  expect(exported.cells[2].outputs[0].ename).toBe("NameError");
  await page.screenshot({
    path: "test-results/notebook-cell-workspace.png",
    fullPage: true,
  });
  // A second window saves a newer revision. Refresh must not silently adopt
  // that revision as the base for the first window's local draft.
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("fq-notebook-workspace-v1:"),
    );
    const { id } = JSON.parse(localStorage.getItem(key));
    const saved = await (await fetch("/api/notebook-sessions/" + id)).json();
    saved.cells[0].source = "# saved in another window";
    const response = await fetch("/api/notebook-sessions/" + id + "/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: saved.revision, cells: saved.cells }),
    });
    if (!response.ok) throw Error("Second window save failed");
  });
  await page.reload();
  await open();
  await expect(
    workspace.getByRole("button", { name: "Save notebook", exact: true }),
  ).toBeEnabled();
  await workspace
    .getByRole("button", { name: "Save notebook", exact: true })
    .click();
  await expect(workspace.getByRole("alert")).toContainText(
    "changed in another window",
  );
  await expect(workspace.getByRole("textbox").first()).toHaveValue(
    "# draft markdown",
  );
  const conflictDraft = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Download local draft and load saved cells" })
    .click();
  const preserved = JSON.parse(
    await readFile(await (await conflictDraft).path(), "utf8"),
  );
  expect(preserved.cells[0].source).toBe("# draft markdown");
  await expect(workspace.getByRole("textbox").first()).toHaveValue(
    "# saved in another window",
  );
  await workspace
    .getByRole("button", { name: "Close notebook workspace" })
    .click();
  await expect(model).toHaveValue("# untouched model draft\nprint('keep me')");
});
