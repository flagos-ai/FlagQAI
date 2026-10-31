import { test, expect } from "@playwright/test";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });
const draft = "# Newer unsaved draft — preserve this\nprint('my work')\n";
const bell = `import flagquantum as fq
circuit = fq.Circuit(2).h(0).cx(0, 1)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
fq.save("bell.fqx", result.plan, result=result)
print(result.counts)
`;
async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function runPython(page, source) {
  const before = new Set(
    (await get(page, "/api/python/runs")).map((run) => run.id),
  );
  if (source !== undefined) await editor(page).fill(source);
  await page.getByRole("button", { name: "Run Python ▷", exact: true }).click();
  let run;
  await expect
    .poll(
      async () => {
        const newest = (await get(page, "/api/python/runs")).find(
          (item) => !before.has(item.id),
        );
        if (!newest) return "not submitted";
        run = await get(page, "/api/python/runs/" + newest.id);
        return run.status;
      },
      { timeout: 90000 },
    )
    .not.toMatch(/^(not submitted|queued|running)$/);
  await expect(page.getByLabel("Python run history")).toHaveValue(run.id);
  return run;
}
async function savedRecord(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  expect(reference).toBeTruthy();
  const record = await get(page, "/api/experiments/" + reference.id);
  expect(record.program.origin.run_id).toBe(run.id);
  expect(record.program.origin.source).toBe(run.source);
  expect(record.program.origin.source_hash).toBe(run.source_hash);
  expect(record.program.experiment.sha256).toBe(reference.sha256);
  return record;
}
async function openCircuit(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  await page
    .getByRole("group", { name: reference.filename, exact: true })
    .getByRole("button", { name: "View circuit ↗" })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await expect(
    page.getByText("· run " + run.id.slice(0, 8), { exact: false }),
  ).toBeVisible();
  return reference;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#model");
  await expect(editor(page)).toBeVisible();
});

for (const [name, states] of [
  ["Bell State", ["00", "11"]],
  ["GHZ State", ["000", "111"]],
  ["X State", ["1"]],
  ["Quantum Arithmetic · 3x + 2", null],
]) {
  test(`real SDK example: ${name} → .fqx → circuit → results`, async ({
    page,
  }) => {
    const agent = page.getByRole("button", {
      name: "FlagQAI Agent",
      exact: true,
    });
    if ((await agent.getAttribute("aria-expanded")) === "true")
      await agent.click();
    await page
      .getByRole("button", {
        name: new RegExp("◇ " + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    const run = await runPython(page);
    expect(run.status, JSON.stringify(run)).toBe("completed");
    expect(run.collection_status).toBe("completed");
    expect(run.runtime.sdk_version).toBe("0.4.0");
    const record = await savedRecord(page, run);
    const counts = record.job.result.counts;
    if (states) expect(Object.keys(counts).sort()).toEqual(states.sort());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    await openCircuit(page, run);
    await expect(
      page.getByRole("group", {
        name: "Interactive hierarchical quantum circuit",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "View saved result →" }).click();
    await expect(page).toHaveURL(/#jobs$/);
    await expect(
      page.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", `/api/experiments/${record.id}/file`);
    for (const count of Object.values(counts))
      await expect(page.getByRole("table")).toContainText(String(count));
  });
}

test("refresh and navigation retain a selected historical result and newer draft", async ({
  page,
}) => {
  const first = await runPython(page, bell);
  const second = await runPython(
    page,
    bell.replace("result = fq.run", "circuit.x(1)\nresult = fq.run"),
  );
  expect(
    Object.keys((await savedRecord(page, second)).job.result.counts).sort(),
  ).toEqual(["01", "10"]);
  await page.getByLabel("Python run history").selectOption(first.id);
  await editor(page).fill(draft);
  const reference = await openCircuit(page, first);
  await expect(
    page.getByText("Differs from editor", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(page.getByLabel("Python run history")).toHaveValue(first.id);
});

test("missing output and real Python errors are distinct and preserve run history", async ({
  page,
}) => {
  const empty = await runPython(page, "print('no archive saved')");
  expect(empty.status).toBe("completed");
  expect(empty.experiments).toHaveLength(0);
  await expect(
    page.getByText(/No .fqx files were saved by this run/),
  ).toBeVisible();
  for (const [source, error] of [
    ["def broken(:\n pass", "SyntaxError"],
    ["import flagqai_nonexistent_acceptance_dependency", "ModuleNotFoundError"],
    ["import flagquantum as fq\nfq.Circuit(1).h(99)", "ValidationError"],
  ]) {
    const run = await runPython(page, source);
    expect(run.status).toBe("failed");
    expect(run.logs.map((item) => item.text).join("")).toContain(error);
    await expect(
      page.getByRole("button", { name: "Ask Agent to fix", exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Python run history").selectOption(empty.id);
  await expect(
    page.getByText("no archive saved", { exact: false }).last(),
  ).toBeVisible();
});

test("preview outage recovers same-name files without rerun; corrupt file stays separate", async ({
  page,
}) => {
  const fault = join(process.env.FQ_E2E_CONTROL_DIR, "preview-offline");
  let run;
  try {
    await writeFile(fault, "test only");
    run = await runPython(
      page,
      bell +
        `from pathlib import Path
Path("nested").mkdir()
fq.save("nested/bell.fqx", result.plan, result=result)
Path("invalid.fqx").write_bytes(b"invalid archive")
`,
    );
    expect(run.status).toBe("completed");
    expect(run.collection_status).toBe("failed");
    expect(run.collection_errors).toHaveLength(3);
  } finally {
    await rm(fault, { force: true });
  }
  await editor(page).fill(draft);
  await page
    .getByRole("button", { name: "Retry collection", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "nested/bell.fqx", exact: true })
      .getByText(/Loaded in Quantum/),
  ).toBeVisible();
  const recovered = await get(page, "/api/python/runs/" + run.id);
  expect(recovered.collection_status).toBe("partial");
  expect(recovered.experiments).toHaveLength(2);
  expect(new Set(recovered.experiments.map((item) => item.id)).size).toBe(2);
  for (const key of [
    "id",
    "source",
    "source_hash",
    "status",
    "exit_code",
    "logs",
    "finished_at",
  ])
    expect(recovered[key]).toEqual(run[key]);
  expect(recovered.collection_errors.map((item) => item.filename)).toEqual([
    "invalid.fqx",
  ]);
  await page
    .getByRole("button", { name: "Retry collection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry collection", exact: true }),
  ).toBeEnabled();
  expect((await get(page, "/api/python/runs/" + run.id)).experiments).toEqual(
    recovered.experiments,
  );
  await expect(editor(page)).toHaveValue(draft);
  await openCircuit(page, recovered, "nested/bell.fqx");
});

test("scripted Agent streams tools, survives lost receipt + refresh, and protects code and chat drafts", async ({
  page,
}) => {
  const failed = await runPython(
    page,
    "# repair-case: syntax\nimport flagquantum as fq\nfq.Circuit(",
  );
  expect(failed.status).toBe("failed");
  await page
    .getByRole("button", { name: "Ask Agent to fix", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await expect(input).toHaveValue(new RegExp(failed.id.slice(0, 8)));
  await editor(page).fill(draft);
  const controlURL = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  const before = (await get(page, controlURL)).submissionCount;
  expect(
    (
      await page.request.post(controlURL, { data: { dropNextReceipt: true } })
    ).ok(),
  ).toBeTruthy();
  try {
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(async () => (await get(page, controlURL)).submissionCount)
      .toBe(before + 1);
    await input.fill("Keep this newer unsent chat draft.");
    await page.reload();
    await expect(input).toHaveValue("Keep this newer unsent chat draft.");
  } finally {
    expect(
      (await page.request.post(controlURL, { data: { offline: false } })).ok(),
    ).toBeTruthy();
  }
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Scripted Agent acceptance; actual FlagQuantum computation.",
    { timeout: 90000 },
  );
  await expect(page.getByRole("button", { name: /Worked for/ })).toBeVisible();
  await page.getByRole("button", { name: /Worked for/ }).click();
  await expect(page.locator(".fq-cli-tool").first()).toBeVisible();
  expect((await get(page, controlURL)).submissionCount).toBe(before + 1);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(input).toHaveValue("Keep this newer unsent chat draft.");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Keep my draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep my draft", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  const old = await get(page, "/api/python/runs/" + failed.id);
  expect(old.source).toBe(failed.source);
  expect(old.status).toBe("failed");
});
