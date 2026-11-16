import { test, expect } from "@playwright/test";

test("native failure guidance preserves the diagnostics and drafts across reload", async ({
  page,
}) => {
  await page.goto("/#model");
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
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const transcript = page.getByRole("log", { name: "Agent conversation" });
  const requests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      requests.push(request.url());
  });
  await expect(connected).toBeVisible();
  const codeDraft = "# Unpublished QAOA draft";
  await editor.fill(codeDraft);

  for (const [scenario, title, diagnostic] of [
    ["output limit", "Model output limit reached", "turn max-tokens"],
    [
      "thinking history",
      "Model could not resume thinking history",
      "reasoning_content",
    ],
  ]) {
    await composer.fill("failure acceptance: " + scenario);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const failure = transcript
      .locator(".fq-agent-failure")
      .filter({ hasText: title });
    const raw = failure.locator("pre");
    await expect(failure).toBeVisible();
    await expect(raw).toBeHidden();
    await failure.getByText("Technical details", { exact: true }).click();
    await expect(raw).toBeVisible();
    await expect(raw).toContainText(diagnostic);
    await expect(connected).toBeVisible();
  }

  const draft = "Inspect the existing QAOA artifacts";
  await composer.fill(draft);
  await page.reload();
  await expect(connected).toBeVisible();
  await expect(transcript.locator(".fq-agent-failure")).toHaveCount(2);
  await expect(composer).toHaveValue(draft);
  await expect(editor).toHaveValue(codeDraft);
  expect(requests).toHaveLength(2);
});
