import { expect, test } from "@playwright/test";

test("legacy synthesis navigation preserves Notebook, Python and chat drafts without executing", async ({
  page,
}) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/(execute|runs|compile)$/.test(new URL(request.url()).pathname)
    )
      submissions++;
  });
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const pythonDraft = "# keep my independent Python draft\nprint(17)";
  await editor.fill(pythonDraft);
  const rail = page.getByRole("navigation", { name: "Research workspace" });
  const agent = rail.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  const chat = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await chat.fill("Keep this unsent question.");
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Notebook", exact: true })
    .click();
  const notebook = page.getByRole("region", {
    name: "Notebook workspace",
    exact: true,
  });
  const code = notebook
    .getByRole("textbox", { name: /^Edit code cell \d+$/ })
    .first();
  const notebookDraft = "# retain this notebook cell\nvalue = 37";
  await code.fill(notebookDraft);
  await expect
    .poll(() =>
      page.evaluate(
        (source) =>
          Object.values(localStorage).some((text) => text.includes(source)),
        "retain this notebook cell",
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    location.hash = "synthesis";
  });
  await expect(page).toHaveURL(/#model$/);
  await expect(
    page.getByRole("region", { name: "Compilation results", exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveValue(pythonDraft);
  await expect(chat).toHaveValue("Keep this unsent question.");
  await expect(
    rail.getByRole("button", { name: "SYNTHESIS", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Notebook", exact: true })
    .click();
  await expect(code).toHaveValue(notebookDraft);
  await page.reload();
  await expect(code).toHaveValue(notebookDraft);
  await expect(chat).toHaveValue("Keep this unsent question.");
  expect(submissions).toBe(0);
});

test("collection failures offer output recovery instead of asking for another compile", async ({
  page,
}) => {
  const source = "print('existing output')";
  const run = {
    id: "collection-regression",
    name: "Existing run",
    source,
    status: "completed",
    execution_status: "completed",
    collection_status: "failed",
    collection_errors: [
      { filename: "nested", message: "Artifact directory depth exceeds 8." },
    ],
    experiments: [],
    logs: [{ stream: "stdout", text: "existing output" }],
    environment: {
      transport: "local",
      python: "python3",
      timeout_seconds: 90,
      scope: "single-file",
    },
  };
  let submissions = 0;
  await page.addInitScript(
    ({ source, id }) => {
      localStorage.setItem(
        "fq-react-workspace-v1",
        JSON.stringify({
          language: "python",
          source,
          name: "Existing run",
          pythonRunId: id,
          modelPanel: "compilation",
        }),
      );
    },
    { source, id: run.id },
  );
  await page.route("**/api/python/runs**", async (route) => {
    if (route.request().method() === "POST") submissions++;
    await route.fulfill({
      json: route.request().url().endsWith("/runs") ? [run] : run,
    });
  });
  await page.goto("/#model");
  const results = page.getByRole("region", {
    name: "Compilation results",
    exact: true,
  });
  await expect(results.getByRole("status")).toHaveText(
    "Circuit collection failed",
  );
  await expect(results).not.toContainText("Set synthesis constraints");
  await results
    .getByRole("button", { name: "View run output and all archives" })
    .click();
  await expect(
    page.getByText("Experiment collection failed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Quantum model code editor" }),
  ).toHaveValue(source);
  expect(submissions).toBe(0);
});
