import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Follow Agent keeps a visible comparison through run updates and follows new code", async ({
  page,
}) => {
  const submitted = await page.request.post("/api/python/runs", {
    data: {
      name: "Follow comparison navigation",
      source: `import flagquantum as fq
for name, circuit in (
    ("follow-baseline", fq.Circuit(1)),
    ("follow-variant", fq.Circuit(1).x(0)),
):
    result = fq.run(circuit, outputs=fq.counts(),
                    options=fq.ExecutionOptions(shots=16, seed=42))
    fq.save(name + ".fqx", result.plan, result=result)
`,
    },
  });
  expect(submitted.ok()).toBeTruthy();
  const { id } = await submitted.json();
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/python/runs/" + id);
      expect(response.ok()).toBeTruthy();
      return (await response.json()).collection_status;
    })
    .toBe("completed");

  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep this unsaved comparison draft\nprint('draft')\n";
  await editor.fill(draft);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  for (const name of ["follow-baseline", "follow-variant"]) {
    await page
      .getByRole("checkbox", { name: "Compare " + name, exact: true })
      .check();
  }
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(comparison).toBeVisible();

  let context;
  await page.route("**/api/workspace/context", async (route) => {
    context = route.request().postDataJSON();
    await route.continue();
  });
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
  const follow = page.getByRole("switch", { name: /Follow Agent/ });
  if ((await follow.getAttribute("aria-checked")) !== "true")
    await follow.click();

  async function agentAction(operation, fields) {
    const response = await page.request.post("/api/workspace/actions", {
      data: {
        client: context.client,
        session: context.session,
        request_id: randomUUID(),
        operation,
        ...fields,
      },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await composer.fill("Do not send this draft");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => context?.page).toBe("jobs");

  const background = await agentAction("python.run", {
    name: "Background comparison update",
    source: "print('already comparing')",
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fq-react-workspace-v1") || "{}")
            .pythonRunId,
      ),
    )
    .toBe(background.python_run.id);
  await expect(page).toHaveURL(/#jobs$/);
  await expect(comparison).toBeVisible();

  const source = "print('new Agent model')\n";
  await agentAction("model.create", {
    name: "Comparison follow model",
    source,
    language: "python",
  });
  await expect(page).toHaveURL(/#model$/);
  await expect(editor).toHaveValue(source);

  await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
  await expect.poll(() => context?.page).toBe("execution");
  const next = await agentAction("python.run", {
    name: "Follow from Execution",
    source,
  });
  await expect(page).toHaveURL(/#model$/);
  await expect(page.getByLabel("Python run history")).toHaveValue(
    next.python_run.id,
  );
  await expect(composer).toHaveValue("Do not send this draft");

  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await expect(comparison).toBeVisible();
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  const edited = source + "# My notes on this Agent version\n";
  await editor.fill(edited);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fq-react-workspace-v1") || "{}")
            .source,
      ),
    )
    .toBe(edited);
  await page.reload();
  await expect(editor).toHaveValue(edited);
  const returnToDraft = page.getByRole("button", {
    name: "Return to draft",
    exact: true,
  });
  await returnToDraft.click();
  await expect(editor).toHaveValue(draft);
  await expect(returnToDraft).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show model library", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Draft · Comparison follow model/ })
    .click();
  await expect(editor).toHaveValue(edited);
});
