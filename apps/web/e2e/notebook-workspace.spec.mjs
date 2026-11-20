import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("IPython cell workspace retains state, receipts, edits and output", async ({
  page,
}) => {
  await page.goto("/#model");
  const model = page.locator(
    'textarea[aria-label="Quantum model code editor"]',
  );
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
  const workspace = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
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
  await workspace.getByText("More", { exact: true }).click();
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
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Python", exact: true })
    .click();
  await expect(model).toHaveValue("# untouched model draft\nprint('keep me')");
});

test("Notebook tab uses the main editor and keeps all drafts when switching modes", async ({
  page,
}) => {
  await page.goto("/#model");
  const modes = page.getByRole("group", { name: "Source language" });
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await editor.fill("# Python draft remains intact");
  await modes.getByRole("button", { name: "OpenQASM", exact: true }).click();
  await editor.fill("// OpenQASM draft remains intact");
  await modes.getByRole("button", { name: "Notebook", exact: true }).click();
  const notebook = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(notebook).toBeVisible();
  await expect(editor).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run Python", exact: true }),
  ).not.toBeVisible();
  await expect(
    notebook.getByRole("button", { name: "Run all", exact: true }),
  ).toBeEnabled();
  await notebook
    .getByRole("textbox")
    .first()
    .fill("# independent notebook draft");
  const selected = await page
    .getByRole("combobox", { name: "Notebook example" })
    .inputValue();
  await modes.getByRole("button", { name: "Python", exact: true }).click();
  await expect(editor).toHaveValue("# Python draft remains intact");
  await modes.getByRole("button", { name: "OpenQASM", exact: true }).click();
  await expect(editor).toHaveValue("// OpenQASM draft remains intact");
  await modes.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(notebook.getByRole("textbox").first()).toHaveValue(
    "# independent notebook draft",
  );
  const picker = page.getByRole("combobox", { name: "Notebook example" });
  const alternate = await picker
    .locator("option")
    .evaluateAll(
      (options, current) =>
        options.find((option) => option.value !== current && !option.disabled)
          .value,
      selected,
    );
  await picker.selectOption(alternate);
  await expect(
    notebook.getByRole("button", { name: "Run all", exact: true }),
  ).toBeEnabled();
  await notebook.getByRole("textbox").first().fill("# another notebook draft");
  await picker.selectOption(selected);
  await expect(notebook.getByRole("textbox").first()).toHaveValue(
    "# independent notebook draft",
  );
  await page.reload();
  await expect(
    modes.getByRole("button", { name: "Notebook", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(notebook.getByRole("textbox").first()).toHaveValue(
    "# independent notebook draft",
  );
  await expect(
    page.getByRole("combobox", { name: "Notebook example" }),
  ).toHaveValue(selected);
  await expect(notebook).toContainText("Not run");
  await page.screenshot({
    path: "test-results/notebook-main-editor.png",
    fullPage: true,
  });
});

test("Notebook renders readable Markdown and editable highlighted Python", async ({
  page,
}) => {
  await page.goto("/#model");
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Notebook", exact: true })
    .click();
  const notebook = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(
    notebook.getByRole("button", { name: "Run all", exact: true }),
  ).toBeEnabled();
  const markdown = notebook.getByRole("region", {
    name: "markdown cell 2",
    exact: true,
  });
  await expect(
    markdown.getByRole("heading", {
      name: "Superposition in native FlagQuantum",
      exact: true,
    }),
  ).toBeVisible();
  await expect(markdown.getByRole("textbox")).toHaveCount(0);
  await markdown
    .getByRole("button", { name: "Edit markdown cell 2", exact: true })
    .click();
  const text = markdown.getByRole("textbox");
  await text.fill(
    "# Research notebook\n\nA **verified result** with *careful analysis*.\n\n- Local execution\n- Saved evidence",
  );
  await expect(markdown.getByRole("heading")).toHaveCount(0);
  await text.press("ControlOrMeta+End");
  await markdown.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(text).toHaveValue(/Saved evidence\*\*text\*\*$/);
  await text.press("Shift+Enter");
  await expect(markdown.getByRole("textbox")).toHaveCount(0);
  await expect(
    markdown.getByRole("heading", { name: "Research notebook" }),
  ).toBeVisible();
  await expect(markdown.locator("strong").first()).toHaveText(
    "verified result",
  );
  await expect(markdown.locator("em")).toHaveText("careful analysis");
  await expect(markdown.getByRole("listitem")).toHaveCount(2);
  await markdown
    .getByLabel("Markdown cell 2 preview", { exact: true })
    .dblclick();
  await expect(text).toHaveValue(/A \*\*verified result\*\*/);
  await markdown
    .getByRole("button", { name: "Render markdown cell 2" })
    .click();
  const code = notebook.getByLabel("Edit code cell 1", { exact: true });
  await code.fill(
    "import flagquantum as fq\n\ndef experiment():\n    return 42\n\nprint('ready') # local result",
  );
  const cell = notebook.getByRole("region", {
    name: "code cell 1",
    exact: true,
  });
  await expect(cell.locator(".fq-token-keyword").first()).toHaveText("import");
  await expect(cell.locator(".fq-token-string")).toHaveText("'ready'");
  await expect(cell.locator(".fq-token-number")).toHaveText("42");
  expect(
    await cell
      .locator(".fq-token-keyword")
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  ).not.toBe(
    await cell
      .locator(".fq-token-string")
      .evaluate((element) => getComputedStyle(element).color),
  );
  await code.press("ControlOrMeta+A");
  await code.press("ArrowLeft");
  await code.press("Tab");
  await expect(code).toHaveValue(/^    import/);
  await code.press("Shift+Tab");
  await expect(code).toHaveValue(/^import/);
  await code.press("ControlOrMeta+/");
  await expect(code).toHaveValue(/^# import/);
  await code.press("ControlOrMeta+/");
  await expect(code).toHaveValue(/^import/);
  const highlightedSource = await code.inputValue();
  await code.fill(
    Array.from(
      { length: 35 },
      (_, i) => `print("row ${i} ${"long output ".repeat(30)}")`,
    ).join("\n"),
  );
  await code.evaluate((element) => {
    element.scrollTop = 120;
    element.scrollLeft = 160;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect
    .poll(async () =>
      cell
        .locator("pre > code")
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("matrix(1, 0, 0, 1, -160, -120)");
  const geometry = await cell.locator("textarea").evaluate((element) => {
    const input = getComputedStyle(element),
      paint = getComputedStyle(element.previousElementSibling);
    return [
      input.fontFamily === paint.fontFamily,
      input.fontSize === paint.fontSize,
      input.lineHeight === paint.lineHeight,
      input.padding === paint.padding,
    ];
  });
  expect(geometry).toEqual([true, true, true, true]);
  await code.fill(highlightedSource);
  await code.press("ControlOrMeta+A");
  await code.press("ArrowLeft");
  // Editing and formatting must not start the kernel or create executions.
  await expect(notebook).not.toContainText("Execution history");
  await page.screenshot({
    path: "test-results/notebook-polished-editor.png",
    fullPage: true,
  });
});

test("Notebook imports independently, preserves metadata and supports reversible cell editing", async ({
  page,
}) => {
  await page.goto("/#model");
  const model = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await model.fill("# original script draft");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const workspace = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(
    workspace.getByRole("button", { name: "Save notebook", exact: true }),
  ).toBeEnabled();
  const original = await workspace.getByRole("textbox").first().inputValue();
  await workspace.getByText("More", { exact: true }).click();
  const document = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { research: { seed: 42 } },
    cells: [
      {
        id: "notes",
        cell_type: "markdown",
        source: "# Imported study",
        metadata: { tags: ["keep"] },
        attachments: { "figure.png": { "image/png": "abc" } },
      },
      {
        id: "calculation",
        cell_type: "code",
        source: ["number = 41\n", "print(number)"],
        metadata: {},
        execution_count: 7,
        outputs: [{ output_type: "stream", name: "stdout", text: ["41\n"] }],
      },
      {
        id: "next",
        cell_type: "code",
        source: "print(number + 1)",
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
  };
  const file = {
    name: "study.ipynb",
    mimeType: "application/x-ipynb+json",
    buffer: Buffer.from(JSON.stringify(document)),
  };
  await workspace.getByLabel("Import notebook file").setInputFiles(file);
  await expect(
    workspace.getByRole("heading", { name: "study.ipynb" }),
  ).toBeVisible();
  await expect(workspace).toContainText("Imported output · not verified here");
  const cells = workspace.locator(".fq-notebook-edit-cell");
  const count = await cells.count();
  await workspace.getByLabel("Cell 2 actions", { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Duplicate cell", exact: true })
    .click();
  await expect(cells).toHaveCount(count + 1);
  await workspace.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells).toHaveCount(count);
  await workspace.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(cells).toHaveCount(count + 1);
  await workspace.getByRole("button", { name: "Undo", exact: true }).click();
  const code = workspace.getByRole("textbox", {
    name: "Edit code cell 2",
    exact: true,
  });
  await code.focus();
  await code.press("ControlOrMeta+a");
  await code.press("ArrowLeft");
  await code.press("ControlOrMeta+Shift+-");
  await expect(cells).toHaveCount(count + 1);
  await workspace.getByLabel("Cell 2 actions", { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Merge with next", exact: true })
    .click();
  await expect(cells).toHaveCount(count);
  await code.press("ControlOrMeta+z");
  await expect(cells).toHaveCount(count + 1);
  await workspace.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells).toHaveCount(count);
  await workspace
    .getByRole("button", { name: "Save notebook", exact: true })
    .click();
  await workspace.getByText("More", { exact: true }).click();
  const download = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Download .ipynb", exact: true })
    .click();
  const exported = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(exported.metadata).toEqual(document.metadata);
  expect(exported.cells[0].attachments).toEqual(document.cells[0].attachments);
  expect(exported.cells[0].metadata).toEqual(document.cells[0].metadata);
  expect(exported.cells[1].outputs).toEqual(document.cells[1].outputs);
  expect(exported.cells[1].source).toBe("number = 41\nprint(number)");
  await page.reload();
  await expect(
    workspace.getByRole("heading", { name: "study.ipynb" }),
  ).toBeVisible();
  await expect(workspace.getByRole("textbox").first()).toHaveValue(
    "number = 41\nprint(number)",
  );
  await expect(workspace).not.toContainText("Execution history");
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await expect(model).toHaveValue("# original script draft");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  // Switching back to the official notebook preserves its independent draft.
  await page.getByRole("combobox", { name: "Notebook example" }).selectOption({
    label:
      "Superposition in native FlagQuantum · community/basic_examples/superposition",
  });
  await expect(workspace.getByRole("textbox").first()).toHaveValue(original);
});

test("Notebook kernel completion, parameter help and partial runs preserve execution order", async ({
  page,
}) => {
  await page.goto("/#model");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const workspace = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  await expect(
    workspace.getByRole("button", { name: "Save notebook", exact: true }),
  ).toBeEnabled();
  await workspace.getByText("More", { exact: true }).click();
  const document = {
    nbformat: 4,
    metadata: {},
    cells: [
      {
        cell_type: "code",
        source:
          'research_value = 41\ndef research_function(alpha, beta=3):\n    """Parameter documentation."""\n    return alpha + beta',
        metadata: {},
      },
      { cell_type: "code", source: "research_value += 1", metadata: {} },
      { cell_type: "code", source: "print(research_value)", metadata: {} },
    ],
  };
  await workspace.getByLabel("Import notebook file").setInputFiles({
    name: "kernel-study.ipynb",
    mimeType: "application/x-ipynb+json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(
    workspace.getByRole("heading", { name: "kernel-study.ipynb" }),
  ).toBeVisible();
  await workspace.getByLabel("Cell 2 actions", { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Run through this cell", exact: true })
    .click();
  await expect(workspace).toContainText("completed", { timeout: 45000 });
  await expect(workspace).not.toContainText("running");
  const code = workspace.getByRole("textbox", {
    name: "Edit code cell 3",
    exact: true,
  });
  await code.fill("# 中文 🧪\nresearch_v");
  await code.press("Control+Space");
  await expect(
    workspace.getByRole("option", { name: "research_value", exact: true }),
  ).toBeVisible();
  await code.press("Tab");
  await expect(code).toHaveValue("# 中文 🧪\nresearch_value");
  await code.fill("research_function(");
  await code.press("Control+Shift+Space");
  await expect(
    workspace
      .getByRole("status")
      .filter({ hasText: "Parameter documentation" }),
  ).toBeVisible();
  await code.press("Escape");
  await code.fill("print(research_value)");
  await workspace.getByLabel("Cell 3 actions", { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Run from this cell", exact: true })
    .click();
  await expect(
    workspace.getByLabel("Output cell 3", { exact: true }),
  ).toContainText("42", { timeout: 45000 });
  await expect(workspace).toContainText("Execution history · 2");
  const toolbar = workspace.locator(".fq-notebook-cell-toolbar").first();
  const runBounds = await toolbar
    .getByRole("button", { name: "Run cell 1", exact: true })
    .boundingBox();
  const menuBounds = await toolbar
    .getByLabel("Cell 1 actions", { exact: true })
    .boundingBox();
  expect(
    Math.abs(
      runBounds.y + runBounds.height / 2 - menuBounds.y - menuBounds.height / 2,
    ),
  ).toBeLessThan(2);
  await page.screenshot({
    path: "test-results/notebook-daily-workflow.png",
    fullPage: true,
  });
});
