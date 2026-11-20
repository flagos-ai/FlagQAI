import { test, expect } from "@playwright/test";

test("inline follow-up accepts with Right Arrow without sending or replacing drafts", async ({
  page,
}) => {
  await page.goto("/#model");
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
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await editor.fill("# preserved research draft");
  const sent = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      sent.push(request.url());
  });
  await expect(composer).not.toHaveAttribute("data-follow-up", "true");
  await composer.fill("transcript scroll acceptance\nExplain this circuit");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveAttribute("data-follow-up", "true");
  const prompt = await composer.getAttribute("placeholder");
  await page.screenshot({ path: "test-results/agent-follow-up-inline.png" });
  await expect(composer).toHaveValue("");
  await composer.focus();
  await composer.press("Shift+ArrowRight");
  await expect(composer).toHaveValue("");
  await composer.press("ArrowRight");
  await expect(composer).toHaveValue(prompt);
  expect(sent).toHaveLength(1);
  await composer.fill("My independent question");
  await composer.press("ArrowRight");
  await expect(composer).toHaveValue("My independent question");
  await page.reload();
  await expect(composer).toHaveValue("My independent question");
  await expect(editor).toHaveValue("# preserved research draft");
  await composer.fill("");
  await expect(composer).toHaveAttribute("data-follow-up", "true");
  await composer.press("Escape");
  await expect(composer).not.toHaveAttribute("data-follow-up", "true");
  await composer.press("ArrowRight");
  await expect(composer).toHaveValue("");
  expect(sent).toHaveLength(1);
  await page.screenshot({ path: "test-results/agent-follow-up-dismissed.png" });
  await composer.fill("transcript scroll acceptance\n请解释这个电路的结果");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveAttribute("data-follow-up", "true");
  await expect(composer).toHaveAttribute("placeholder", /[\u3400-\u9fff]/);
  await page.reload();
  await expect(composer).toHaveAttribute("placeholder", /[\u3400-\u9fff]/);
  await composer.press("ArrowRight");
  await expect(composer).toHaveValue(/[\u3400-\u9fff]/);
  expect(sent).toHaveLength(2);
  await composer.fill(
    "transcript scroll acceptance\nExplain the results in detail",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveAttribute("data-follow-up", "true");
  await expect(composer).not.toHaveAttribute("placeholder", /[\u3400-\u9fff]/);
  await expect(editor).toHaveValue("# preserved research draft");
  expect(sent).toHaveLength(3);
});
