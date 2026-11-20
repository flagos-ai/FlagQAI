import { chooseNotebook } from "./notebook-picker.mjs";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(
    new URL("../src/data/notebook-catalog.json", import.meta.url),
    "utf8",
  ),
);
const cooling =
  catalog.entries.find((item) =>
    /cooling_system.*overview|cooling_system.*optimization/.test(item.path),
  ) || catalog.entries.find((item) => /cooling/i.test(item.title));
const other = catalog.entries.find(
  (item) => item.path === "community/basic_examples/superposition",
);

for (const explicitReference of [false, true]) {
  test(`Agent ${explicitReference ? "explicitly references" : "does not automatically attach"} the visible notebook and preserves drafts`, async ({
    page,
  }) => {
    const cells = [
      { id: "abc123", cell_type: "code", source: "cooling_capacity = 42" },
    ];
    let executions = 0;
    await page.route("**/api/notebook-sessions**", async (route) => {
      const request = route.request();
      if (request.url().endsWith("/execute")) executions++;
      const id =
        request.method() === "POST"
          ? request.postDataJSON()?.notebook_id
          : cooling.id;
      await route.fulfill({
        json: {
          id: "a".repeat(32),
          title: id === other.id ? other.title : cooling.title,
          notebook_id: id || cooling.id,
          revision: "v1",
          cells,
          kernel: "idle",
          kernel_id: "kernel-1",
          runs: [],
        },
      });
    });
    const publications = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/workspace/context"))
        publications.push(request.postDataJSON());
    });
    const sent = [];
    await page.route("**/messages", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.abort("connectionfailed");
    });
    await page.goto("/#model");
    const editor = page.getByRole("textbox", {
      name: "Quantum model code editor",
    });
    await editor.fill("# Shor readout hidden draft\nprint('Shor')");
    await page.evaluate(
      (id) =>
        localStorage.setItem(
          "fq-notebook-editor-v1",
          JSON.stringify({ active: true, id }),
        ),
      cooling.id,
    );
    await page.reload();
    const workspace = page.getByRole("region", {
      name: "Notebook workspace",
      exact: true,
    });
    await expect(workspace.getByRole("textbox").first()).toHaveValue(
      cells[0].source,
    );
    await workspace
      .getByRole("textbox")
      .first()
      .fill("cooling_capacity = 43 # unsaved");
    const toggle = page.getByRole("button", {
      name: "FlagQAI Agent",
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await page
      .getByRole("button", { name: "Connect Agent", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    await expect.poll(() => publications.at(-1)?.language).toBe("notebook");
    await expect
      .poll(() => publications.at(-1)?.source)
      .toContain("cooling_capacity = 43");
    expect(publications.at(-1).editorFile).toBeUndefined();
    const composer = page.getByRole("textbox", {
      name: "Message FlagQAI",
      exact: true,
    });
    if (explicitReference)
      await page
        .getByRole("button", { name: "Reference in chat ↗", exact: true })
        .click();
    await composer.fill(
      explicitReference
        ? "Explain the current notebook"
        : "What is quantum entanglement?",
    );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].text).toContain(cooling.title);
    if (explicitReference) {
      expect(sent[0].text).toContain("cooling_capacity = 43");
      expect(sent[0].text).toContain('"kind":"notebook"');
    } else {
      expect(sent[0].text).not.toContain("cooling_capacity");
      expect(sent[0].text).not.toContain("<workspace_context>");
      expect(sent[0].text).toContain("resource=draft");
    }
    expect(sent[0].text).not.toContain("Shor");
    const original = sent[0].text;
    await composer.fill("Keep this chat draft");
    await chooseNotebook(page, other.id);
    await expect.poll(() => publications.at(-1)?.notebookId).toBe(other.id);
    await page.reload();
    await expect(composer).toHaveValue("Keep this chat draft");
    await chooseNotebook(page, cooling.id);
    await expect(workspace.getByRole("textbox").first()).toHaveValue(
      "cooling_capacity = 43 # unsaved",
    );
    await page.getByRole("button", { name: "Python", exact: true }).click();
    await expect(editor).toHaveValue(
      "# Shor readout hidden draft\nprint('Shor')",
    );
    await expect.poll(() => publications.at(-1)?.language).toBe("python");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(original);
    expect(executions).toBe(0);
  });
}
