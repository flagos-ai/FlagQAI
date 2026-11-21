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

test("recommended follow-up preserves conversation scope despite an unrelated editor and refresh", async ({
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
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await editor.fill(
    "# Shor readout is unrelated to this conversation\nprint(15)",
  );
  await composer.fill(
    "transcript scroll acceptance\n请讨论 Cooling-system optimization 的 synth 资源开销",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveAttribute("data-follow-up", "true");
  await expect(composer).toHaveAttribute("placeholder", /^承接你上一条回答，/);
  await composer.press("ArrowRight");
  const question = await composer.inputValue();
  await page.reload();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue(question);
  await editor.fill("# Another unrelated unsaved Shor draft\nprint(21)");
  const sent = [];
  await page.route("**/messages", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.abort("connectionfailed");
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  const text = sent[0].text;
  const marker = "\n\n<workspace_controls>\n";
  const controls = JSON.parse(
    text.slice(
      text.lastIndexOf(marker) + marker.length,
      -"\n</workspace_controls>".length,
    ),
  );
  expect(controls.conversationFollowUp.scope).toBe("previous-answer");
  expect(controls.conversationFollowUp.userRowId).toEqual(expect.any(Number));
  expect(controls.conversationFollowUp.assistantRowId).toEqual(
    expect.any(Number),
  );
  expect(controls.conversationFollowUp.guidance).toContain(
    "Do not substitute the currently open editor",
  );
  expect(controls.activeDocumentGuidance).toContain("ambient UI state");
  expect(text).not.toContain("<workspace_context>");
  expect(text).not.toContain("print(21)");
  expect(text).not.toContain("print(15)");
  expect(text.slice(0, text.indexOf(marker))).toBe(question);
  await expect(composer).toHaveValue(question);
  await expect(editor).toHaveValue(
    "# Another unrelated unsaved Shor draft\nprint(21)",
  );
});
