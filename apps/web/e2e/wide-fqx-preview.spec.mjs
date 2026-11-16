import { expect, test } from "@playwright/test";

test("the saved circuit canvas keeps its highest wire and gate accessible", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# existing draft\nprint(256)";
  await editor.fill(draft);
  const runIds = async () => {
    const list = await page.request.get("/api/python/runs");
    expect(list.ok()).toBe(true);
    return (await list.json()).map((item) => item.id);
  };
  const before = new Set(await runIds());
  const response = await page.request.post("/api/python/runs", {
    data: {
      name: "Wide recorded circuit",
      source: `import flagquantum as fq
circuit = fq.Circuit(256).h(255)
fq.save("wide-preview.fqx", fq.compile(circuit))
`,
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  let run;
  await expect
    .poll(
      async () => {
        const state = await page.request.get("/api/python/runs/" + id);
        run = await state.json();
        return run.status;
      },
      { timeout: 45000 },
    )
    .toBe("completed");
  expect(run.experiments).toHaveLength(1);
  expect(run.collection_status).toBe("completed");
  await page.reload();
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page
    .getByRole("button", { name: "Open quantum program wide-preview" })
    .click();
  const canvas = page.getByRole("group", {
    name: "Interactive hierarchical quantum circuit",
  });
  await page
    .getByRole("combobox", { name: "Circuit detail" })
    .selectOption("100");
  const gate = canvas.getByRole("button", { name: /Inspect H gate/ });
  await expect(canvas.getByText("q255", { exact: true })).toBeAttached();
  await gate.scrollIntoViewIfNeeded();
  await expect(gate).toBeInViewport();
  await gate.click();
  await expect(page.locator(".fq-node-details")).toContainText("Qubits: 255");
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
  expect((await runIds()).filter((item) => !before.has(item))).toEqual([id]);
});
