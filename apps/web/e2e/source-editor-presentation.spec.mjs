import { test, expect } from "@playwright/test";

test("source editor presentation preserves drafts, geometry and manual output size", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const languages = page.getByRole("group", { name: "Source language" });
  const panel = page.locator('.fq-model-center[data-notebook="false"]');
  const commands = page.getByRole("toolbar", { name: "Model commands" });
  const resize = page.getByRole("separator", {
    name: "Resize model errors panel",
    exact: true,
  });
  const drafts = {
    Python: Array.from(
      { length: 60 },
      (_, i) => `print(${i}, '${"research ".repeat(24)}')`,
    ).join("\n"),
    OpenQASM:
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n',
  };
  for (const [language, source] of Object.entries(drafts)) {
    await languages
      .getByRole("button", { name: language, exact: true })
      .click();
    await editor.fill(source);
    await editor.press("Control+Home");
    await expect(
      commands.getByRole("button", {
        name: language === "Python" ? "Run Python" : "Compile",
        exact: true,
      }),
    ).toBeVisible();
    for (const viewport of [
      { width: 1920, height: 1000 },
      { width: 1440, height: 900 },
      { width: 1000, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const geometry = await panel.evaluate((element) => {
        const box = (selector) =>
          element.querySelector(selector).getBoundingClientRect();
        const toolbar = box(".fq-model-toolbar");
        const document = box(".fq-model-document");
        const commands = box(".fq-model-commands");
        const layers = [
          element.querySelector(".fq-editor > textarea"),
          element.querySelector(".fq-editor > .fq-highlight"),
        ].map((layer) => {
          const css = getComputedStyle(layer);
          return {
            padding: css.padding,
            font: css.font,
            lineHeight: css.lineHeight,
          };
        });
        return {
          overflow: [
            element,
            element.querySelector(".fq-model-toolbar"),
            element.querySelector(".fq-model-commands"),
            element.querySelector(".fq-errors .fq-pane-title"),
          ].some((item) => item.scrollWidth > item.clientWidth + 1),
          toolbarHeight: toolbar.height,
          sameRow:
            Math.abs(
              (document.top + document.bottom) / 2 -
                (commands.top + commands.bottom) / 2,
            ) < 2,
          layers,
        };
      });
      expect(geometry.overflow).toBe(false);
      expect(geometry.layers[0]).toEqual(geometry.layers[1]);
      if (viewport.width === 1920) {
        expect(geometry.sameRow).toBe(true);
        expect(geometry.toolbarHeight).toBeLessThanOrEqual(56);
      }
      await expect(
        commands.getByRole("button", {
          name: "Reference in chat ↗",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        commands.getByRole("button", { name: "Save", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/source-${language.toLowerCase()}-${viewport.width}.png`,
      });
    }
    await resize.focus();
    const initial = Number(await resize.getAttribute("aria-valuenow"));
    await resize.press("ArrowUp");
    await expect(resize).toHaveAttribute("aria-valuenow", String(initial + 12));
    await page.reload();
    await expect(resize).toHaveAttribute("aria-valuenow", String(initial + 12));
    await expect(editor).toHaveValue(source);
    await commands
      .getByRole("button", { name: "Configuration", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Collapse configuration", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Collapse configuration", exact: true })
      .click();
    await expect(editor).toHaveValue(source);
  }
  for (const [language, source] of Object.entries(drafts)) {
    await languages
      .getByRole("button", { name: language, exact: true })
      .click();
    await expect(editor).toHaveValue(source);
  }
});

test("Python editor retains multiline docstring colors across edits and reload", async ({
  page,
}) => {
  await page.goto("/#model");
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Python", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const source =
    '"""Shor readout\n\nfor N = 15: int(bits, 2), gcd(a, N), "quoted" # prose\n"""\nprint(15)\n';
  const prose = page.locator('.fq-highlight [data-editor-line="3"]');
  await editor.fill(source);
  await expect(prose.locator(".fq-token-string")).toHaveText(
    'for N = 15: int(bits, 2), gcd(a, N), "quoted" # prose',
  );
  await expect(
    prose.locator(".fq-token-keyword, .fq-token-number, .fq-token-function"),
  ).toHaveCount(0);
  await expect(
    page.locator('.fq-highlight [data-editor-line="5"] .fq-token-function'),
  ).toHaveText("print");
  await page.reload();
  await expect(editor).toHaveValue(source);
  await expect(prose.locator(".fq-token-string")).toHaveCount(1);
  await editor.fill('"""Editing\nfor N = 15\n');
  await expect(
    page.locator('.fq-highlight [data-editor-line="2"] .fq-token-string'),
  ).toHaveText("for N = 15");
  await editor.fill(source);
  await page.screenshot({
    path: "test-results/python-multiline-docstring.png",
  });
});

test("Notebook docstring prose stays string-colored without executing cells", async ({
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
  const code = notebook.getByLabel("Edit code cell 1", { exact: true });
  const source = '"""Readout\nfor N = 15: int(bits, 2) # prose\n"""\nprint(15)';
  await code.fill(source);
  const cell = notebook.getByRole("region", {
    name: "code cell 1",
    exact: true,
  });
  await expect(
    cell.locator(".fq-token-string").filter({ hasText: "for N = 15" }),
  ).toHaveText('"""Readout\nfor N = 15: int(bits, 2) # prose\n"""');
  await expect(
    cell.locator(".fq-token-keyword, .fq-token-comment"),
  ).toHaveCount(0);
  await expect(cell.locator(".fq-token-number")).toHaveText("15");
  await page.reload();
  await expect(code).toHaveValue(source);
  await expect(
    cell.locator(".fq-token-string").filter({ hasText: "for N = 15" }),
  ).toHaveCount(1);
});
