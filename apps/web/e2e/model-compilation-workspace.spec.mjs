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
