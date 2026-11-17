import { expect, test } from "@playwright/test";

test("next-experiment guidance follows the saved run while editing and refreshing", async ({
  page,
}) => {
  await page.goto("/#model");
  const pane = page.getByRole("region", { name: "Python output", exact: true });
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const guidance = pane.locator(".fq-research-next-step");
  const runButton = page.getByRole("button", {
    name: "Run Python",
    exact: true,
  });
  const history = async () => {
    const response = await page.request.get("/api/python/runs");
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const before = new Set((await history()).map(({ id }) => id));
  await expect(guidance).toHaveCount(0);
  await runButton.click();
  const summary = guidance.locator("summary");
  await expect(summary).toContainText(
    "Compare an entangled pair with a product state",
  );
  await expect(guidance).not.toHaveAttribute("open");
  await summary.scrollIntoViewIfNeeded();
  await summary.press("Enter");
  const question = guidance.getByText(
    "How does the controlled-X gate change the recorded outcomes?",
    { exact: true },
  );
  await expect(question).toBeInViewport();
  await expect(guidance).toContainText("same shots and seed");
  const originalRuns = (await history()).filter(({ id }) => !before.has(id));
  expect(originalRuns).toHaveLength(1);
  await expect(guidance).toContainText(originalRuns[0].id.slice(0, 8));
  const compact = pane.getByRole("button", {
    name: "Compact Python output",
    exact: true,
  });
  await compact.click();
  await expect(pane).toHaveClass(/is-compact/);
  await expect(guidance).toHaveAttribute("open");
  await summary.scrollIntoViewIfNeeded();
  await summary.press("Enter");
  await expect(guidance).not.toHaveAttribute("open");
  await summary.press("Enter");
  await expect(question).toBeInViewport();
  const draft = (await editor.inputValue()) + "\n# test a revised draft";
  await editor.fill(draft);
  await expect(summary).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(draft);
  await expect(summary).toBeVisible();
  await expect(guidance).not.toHaveAttribute("open");
  expect((await history()).filter(({ id }) => !before.has(id))).toHaveLength(1);
  await runButton.click();
  await expect
    .poll(async () => {
      const added = (await history()).find(
        ({ id }) => !before.has(id) && id !== originalRuns[0].id,
      );
      return added?.status;
    })
    .toBe("completed");
  await expect(guidance).toHaveCount(0);
});
