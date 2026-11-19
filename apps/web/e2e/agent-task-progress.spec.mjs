import { expect, test } from "@playwright/test";

test("Agent task summary names the live step and keeps the finished checklist", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep this circuit draft during the progress check.\n";
  await editor.fill(draft);
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  const connected = page.getByRole("status", {
    name: "Connected",
    exact: true,
  });
  await expect(connected).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message FlagQAI", exact: true })
    .fill("Inspect circuit progress.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();

  const progress = page.getByRole("region", { name: "Task progress" });
  const checklist = progress.locator("details").filter({
    has: page.getByRole("progressbar"),
  });
  const summary = checklist.locator(":scope > summary");
  await expect(summary).toContainText("Tasks 0/3");
  await expect(summary).toContainText("Inspect circuit");
  await expect(summary).not.toContainText("Review gate semantics");
  const live = page.locator(".fq-agent-work-live");
  await expect(live).toBeVisible();
  await expect(live.locator(".fq-live-activity-summary strong")).toBeVisible();
  await expect(live.locator(".fq-live-activity-preview")).toContainText(
    "Inspect circuit",
  );
  await expect(checklist).not.toHaveAttribute("open");
  await summary.press("Enter");
  await expect(checklist.getByRole("listitem")).toHaveCount(3);
  await summary.press("Enter");
  await expect(summary).toContainText("Tasks 2/3");
  await expect(summary).toContainText("Summarize findings");

  await expect(connected).toBeVisible();
  const history = page
    .getByRole("log", { name: "Agent conversation" })
    .getByText(/^Worked for /);
  await history.click();
  await expect(summary).toContainText("Tasks 3/3");
  await expect(summary).not.toContainText("Summarize findings");
  await summary.press("Enter");
  await expect(checklist.getByRole("listitem").last()).toContainText(
    "Summarize findings",
  );
  await expect(editor).toHaveValue(draft);
});
