import { test, expect } from "@playwright/test";

test("latest output hides at the bottom and opening Worked for reveals its first tool", async ({
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
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();

  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Unpublished QAOA code";
  await editor.fill(draft);
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const transcript = page.getByRole("log", { name: "Agent conversation" });
  const latest = page.getByRole("button", {
    name: "Jump to latest output",
    exact: true,
  });
  const sent = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      sent.push(request.url());
  });
  await composer.fill(
    "transcript scroll acceptance\n\n" +
      Array.from(
        { length: 35 },
        (_, index) => `Research note ${index + 1}.`,
      ).join("\n\n"),
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(transcript.getByText("Recorded finding 32.")).toBeVisible();

  await transcript.evaluate((node) => (node.scrollTop = 0));
  await expect(latest).toHaveText("↓");
  await transcript.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(latest).toHaveCount(0);
  await transcript.evaluate((node) => (node.scrollTop = 0));
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(latest).toHaveCount(0);
  await expect
    .poll(() =>
      transcript.evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(2);

  await transcript.evaluate((node) => {
    const header = node.querySelector(".fq-agent-work > summary");
    const bounds = node.getBoundingClientRect();
    node.scrollTop += header.getBoundingClientRect().bottom - bounds.bottom + 6;
  });
  const worked = transcript.locator(".fq-agent-work > summary");
  const first = transcript
    .getByRole("region", { name: "Read tool call" })
    .first();
  await worked.click({ position: { x: 12, y: 8 } });
  await expect(first).toBeInViewport({ ratio: 0.8 });
  await expect(worked).toBeInViewport();
  await expect(first).toContainText("Failed · Earlier call");
  await expect(first.getByText("Fixture read failed.")).toHaveCount(0);
  await first.getByRole("button", { name: /Earlier call/ }).click();
  await expect(first.getByLabel("Tool result preview")).toContainText(
    "Fixture read failed.",
  );
  await expect(transcript.getByText("Recorded finding 32.")).toBeVisible();
  await expect(editor).toHaveValue(draft);
  expect(sent).toHaveLength(1);
});
