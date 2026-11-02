import { test, expect } from "@playwright/test";
import { writeFile, readFile, rm } from "node:fs/promises";
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
async function showJobEvidence(page) {
  const result = page.getByRole("region", { name: "Job results", exact: true });
  await result.getByRole("button", { name: "Table", exact: true }).click();
  const disclosure = result.locator("details.fq-job-provenance");
  if ((await disclosure.getAttribute("open")) === null)
    await result
      .getByLabel("Run details and provenance", { exact: true })
      .click();
  return result;
}
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
  await page
    .getByRole("button", { name: /^(Run Python|Save & run)$/, exact: true })
    .click();
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
async function openProgramMetadata(page) {
  const details = page.locator(".fq-program-metadata");
  await expect(details).toBeVisible();
  if (!(await details.evaluate((element) => element.open)))
    await details.locator(":scope > summary").click();
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
  await openProgramMetadata(page);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await expect(
    page.getByText("· run " + run.id.slice(0, 8), { exact: false }),
  ).toBeVisible();
  await page.locator(".fq-program-metadata > summary").click();
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
        name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
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
    const results = page.getByRole("region", {
      name: "Job results",
      exact: true,
    });
    await expect(
      results.getByRole("region", { name: "Measurement distribution" }),
    ).toBeVisible();
    await results.getByRole("button", { name: "Table", exact: true }).click();
    for (const count of Object.values(counts))
      await expect(results.getByRole("table")).toContainText(
        count.toLocaleString("en-US"),
      );
    await results
      .getByLabel("Run details and provenance", { exact: true })
      .click();
    await expect(
      results.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", `/api/experiments/${record.id}/file`);
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
  await openProgramMetadata(page);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(page.getByLabel("Python run history")).toHaveValue(first.id);
});

test("missing output and real Python errors are distinct and preserve run history", async ({
  page,
}, testInfo) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const empty = await runPython(page, "print('no archive saved')");
  const failedRuns = [];
  expect(empty.status).toBe("completed");
  expect(empty.experiments).toHaveLength(0);
  await expect(
    page.getByText(/No .fqx files were saved by this run/),
  ).toBeVisible();
  for (const [source, error] of [
    ["def broken(:\n pass", "SyntaxError"],
    ["import flagqai_nonexistent_acceptance_dependency", "ModuleNotFoundError"],
    ["import flagquantum as fq\nfq.Circuit(1).h(99)", "ValidationError"],
    [
      "# " +
        "long context ".repeat(150) +
        "\n" +
        "# preserved context\n".repeat(79) +
        "raise ValueError('snapshot location')",
      "ValueError",
    ],
  ]) {
    const run = await runPython(page, source);
    expect(run.status).toBe("failed");
    failedRuns.push(run.id);
    const runHistory = page.getByLabel("Python run history");
    await expect(runHistory.locator(`option[value="${run.id}"]`)).toContainText(
      run.id.slice(0, 8),
    );
    await expect(
      runHistory.locator(`option[value="${empty.id}"]`),
    ).toContainText(empty.id.slice(0, 8));
    await expect(runHistory).toHaveAttribute("title", new RegExp(run.id));
    expect(run.logs.map((item) => item.text).join("")).toContain(error);
    await expect(
      page.getByRole("button", { name: "Ask Agent to fix", exact: true }),
    ).toBeVisible();
    const expectedLine =
      error === "ValueError" ? 81 : error === "ValidationError" ? 2 : 1;
    const failure = page.getByRole("region", {
      name: "Python failure",
      exact: true,
    });
    if (error === "ValueError") {
      await editor(page).evaluate((element) => {
        element.scrollLeft = 1000;
        element.scrollTop = 0;
        element.dispatchEvent(new Event("scroll"));
      });
      expect(
        await editor(page).evaluate((element) => element.scrollLeft),
      ).toBeGreaterThan(500);
    }
    await expect(
      failure.getByRole("button", {
        name: `Go to line ${expectedLine} ↗`,
        exact: true,
      }),
    ).toBeVisible();
    await failure
      .getByRole("button", {
        name: `Go to line ${expectedLine} ↗`,
        exact: true,
      })
      .click();
    expect(
      await editor(page).evaluate((element) =>
        element.value.slice(element.selectionStart, element.selectionEnd),
      ),
    ).toBe(source.split("\n")[expectedLine - 1]);
    await expect(editor(page)).toBeFocused();
    if (error === "ValueError") {
      await expect
        .poll(() => editor(page).evaluate((element) => element.scrollLeft))
        .toBe(0);
      await expect
        .poll(() =>
          page
            .locator(`[data-editor-line="${expectedLine}"]`)
            .evaluate((element) => {
              const line = element.getBoundingClientRect();
              const editor = document
                .querySelector(
                  'textarea[aria-label="Quantum model code editor"]',
                )
                .getBoundingClientRect();
              return line.top >= editor.top && line.bottom <= editor.bottom;
            }),
        )
        .toBe(true);
    }
    await editor(page).fill(source + "\n# newer unsaved work");
    await expect(
      failure.getByRole("button", { name: /^Go to line/ }),
    ).toHaveCount(0);
    await failure
      .getByRole("button", { name: "View failed source", exact: true })
      .click();
    const snapshot = page.getByRole("dialog", {
      name: "Failed Python source",
      exact: true,
    });
    const highlighted = snapshot.locator('[data-highlighted="true"]');
    await expect(highlighted).toHaveAttribute(
      "data-line",
      String(expectedLine),
    );
    await expect
      .poll(() =>
        highlighted.evaluate((element) => {
          const panel = element.closest("pre").getBoundingClientRect(),
            line = element.getBoundingClientRect();
          return line.top >= panel.top && line.bottom <= panel.bottom;
        }),
      )
      .toBe(true);
    if (error === "ValueError") {
      await snapshot
        .getByRole("button", {
          name: "Copy Executed Python snapshot",
          exact: true,
        })
        .click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(source);
      await page.screenshot({
        path: testInfo.outputPath("failed-line.png"),
        fullPage: true,
      });
    }
    await snapshot
      .getByRole("button", { name: "Close failed source", exact: true })
      .click();
    await expect(editor(page)).toHaveValue(source + "\n# newer unsaved work");
    expect((await get(page, "/api/python/runs/" + run.id)).source).toBe(source);
  }
  let releaseRepair;
  const repairGate = new Promise((resolve) => {
    releaseRepair = resolve;
  });
  let repairRequests = 0;
  await page.route("**/api/editor/files", async (route) => {
    repairRequests++;
    await repairGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Acceptance repair unavailable" }),
    });
  });
  try {
    await page
      .getByRole("button", { name: "Ask Agent to fix", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Preparing…", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Python run history").selectOption(failedRuns[0]);
    await expect(
      page.getByRole("button", { name: "Preparing another run…", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => repairRequests).toBe(1);
    releaseRepair();
    await expect(
      page.getByRole("button", { name: "Ask Agent to fix", exact: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Acceptance repair unavailable" }),
    ).toHaveCount(0);
    await page.getByLabel("Python run history").selectOption(failedRuns.at(-1));
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Acceptance repair unavailable" }),
    ).toBeVisible();
  } finally {
    releaseRepair();
    await page.unroute("**/api/editor/files");
  }
  await page.getByLabel("Python run history").selectOption(empty.id);
  await expect(
    page.getByText("no archive saved", { exact: false }).last(),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Source language", exact: true })
    .getByRole("button", { name: "OpenQASM", exact: true })
    .click();
  const invalid =
    "OPENQASM 2.0;\nqreg q[1];\n" + "\t".repeat(50) + "x missing[0];";
  await editor(page).fill(invalid);
  await page
    .locator(".fq-error-list")
    .getByRole("button")
    .filter({ hasText: 'Undeclared register "missing"' })
    .click();
  await expect(editor(page)).toBeFocused();
  expect(
    await editor(page).evaluate((element) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe("missing[0]");
  await expect
    .poll(() => editor(page).evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);
  await expect
    .poll(() =>
      page
        .locator('[data-editor-line="3"] .fq-token-number')
        .evaluate((element) => {
          const token = element.getBoundingClientRect();
          const editor = document
            .querySelector('textarea[aria-label="Quantum model code editor"]')
            .getBoundingClientRect();
          return (
            token.left >= editor.left &&
            token.right <= editor.right &&
            token.top >= editor.top &&
            token.bottom <= editor.bottom
          );
        }),
    )
    .toBe(true);
  await expect(editor(page)).toHaveValue(invalid);
  await page.screenshot({
    path: testInfo.outputPath("qasm-error-location.png"),
    fullPage: true,
  });
  await editor(page).fill(invalid.replace("missing", "q"));
  await expect(page.locator(".fq-error-list .fq-diagnostic.error")).toHaveCount(
    0,
  );
  await page
    .getByRole("group", { name: "Source language", exact: true })
    .getByRole("button", { name: "Python", exact: true })
    .click();
  const vectorRun = await runPython(
    page,
    `import flagquantum as fq
circuit = fq.Circuit(1).h(0)
result = fq.run(circuit)
fq.save("statevector_only.fqx", result.plan, result=result)
`,
  );
  expect(vectorRun.status).toBe("completed");
  const vectorRecord = await savedRecord(page, vectorRun);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Open job " + vectorRecord.job.name,
      exact: true,
    })
    .click();
  const vectorResults = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await expect(vectorResults).toContainText("No counts distribution");
  await vectorResults
    .getByRole("button", { name: "Export results", exact: true })
    .click();
  await expect(
    vectorResults.getByRole("button", {
      name: "CSV · selected measurement",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    vectorResults.getByRole("group", { name: "Export formats", exact: true }),
  ).toContainText("Use JSON for the complete saved result");
  const vectorDownload = page.waitForEvent("download");
  await vectorResults
    .getByRole("button", { name: "JSON", exact: true })
    .click();
  const downloadedVector = await vectorDownload;
  const { readFile: readVector } = await import("node:fs/promises");
  expect(
    JSON.parse(await readVector(await downloadedVector.path(), "utf8")).id,
  ).toBe(vectorRecord.job.id);
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
}, testInfo) => {
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
  const header = page.locator(".fq-agent-header");
  expect((await header.boundingBox()).height).toBeLessThanOrEqual(40);
  await expect(page.locator(".fq-agent-state-note")).toHaveCount(0);
  await expect(
    page
      .locator(".fq-agent-draft-meta")
      .getByRole("button", { name: "Connection", exact: true }),
  ).toHaveCount(0);
  const connectionControl = header.getByRole("button", {
    name: "Agent connection details",
    exact: true,
  });
  await connectionControl.click();
  const connectionDialog = page.getByRole("dialog", {
    name: "Agent connection",
    exact: true,
  });
  await expect(
    connectionDialog.getByRole("button", {
      name: "Reconnect Agent",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(connectionDialog).toContainText("flagqai serve --port 4096");
  await expect(
    connectionDialog.locator(".fq-agent-connection-technical"),
  ).not.toHaveAttribute("open", "");
  expect(
    await connectionDialog.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe("none");
  await page.screenshot({
    path: testInfo.outputPath("agent-connection-dialog.png"),
    fullPage: true,
  });
  await connectionDialog
    .getByText("Connection details", { exact: true })
    .click();
  await expect(connectionDialog.locator("code")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(connectionDialog).toHaveCount(0);
  await expect(connectionControl).toBeFocused();
  await expect(
    header.getByRole("button", { name: "New chat", exact: true }),
  ).toBeEnabled();
  await header
    .getByRole("button", { name: "Models and providers", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Models and providers",
    exact: true,
  });
  await expect(
    settings.getByRole("combobox", { name: "Agent backend", exact: true }),
  ).toBeDisabled();
  await expect(
    settings.getByRole("button", { name: "Providers", exact: true }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Close Agent settings", exact: true })
    .click();
  await header
    .getByRole("button", { name: "Resume Agent session", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Resume Agent session", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close session history", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("compact-agent-header.png"),
    fullPage: true,
  });
  const sidebar = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  for (let step = 0; step < 3; step++) await sidebar.press("Shift+ArrowLeft");
  await expect(sidebar).toHaveAttribute("aria-valuenow", "170");
  expect(
    await header.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await expect(
    header.getByRole("button", { name: "Show model library", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("compact-agent-header-narrow.png"),
    fullPage: true,
  });
  await sidebar.dblclick();
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
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  const controlURL = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-repair");
  await writeFile(hold, "Wait for live tool observation after reconnect");
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
  } catch (problem) {
    await rm(hold, { force: true });
    throw problem;
  } finally {
    // Cleanup is independent of Playwright's test deadline so it cannot mask
    // the original UI error or leave later tests behind an offline proxy.
    const restored = await fetch(controlURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline: false }),
      signal: AbortSignal.timeout(5000),
    });
    expect(restored.ok).toBeTruthy();
  }
  try {
    await expect(
      page.locator(".fq-agent-work-live .fq-cli-tool").first(),
    ).toBeVisible();
    await expect(page.locator(".fq-agent-work-live")).toContainText(
      "python.read",
    );
  } finally {
    await rm(hold, { force: true });
  }
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Scripted Agent acceptance; actual FlagQuantum computation.",
    { timeout: 90000 },
  );
  const workSummary = page.locator(".fq-agent-work > summary");
  await expect(workSummary).toBeVisible();
  await expect(workSummary).toContainText("Worked");
  await workSummary.click();
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

test("project files, native Agent edits, draft review and multi-file SDK snapshots survive refresh", async ({
  page,
}) => {
  const main =
    "# project-acceptance\n" +
    bell.replace(
      "circuit = fq.Circuit(2).h(0).cx(0, 1)",
      "from helper import prepare\ncircuit = prepare(fq)",
    );
  const helper = "def prepare(fq):\n    return fq.Circuit(2).h(0).cx(0, 1)\n";
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("browser-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  const create = async (path, source) => {
    await page.getByRole("button", { name: "New file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "New project file", exact: true })
      .fill(path);
    await page
      .getByRole("button", { name: "Create project file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Switch to " + path, exact: true }),
    ).toBeVisible();
    await editor(page).fill(source);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
  };
  await create("helper.py", helper);
  await create("main.py", main);
  const first = await runPython(page);
  expect(first.status).toBe("completed");
  expect(first.project.files.map((item) => item.path).sort()).toEqual([
    "helper.py",
    "main.py",
  ]);
  const original = await savedRecord(page, first);
  expect(original.program.origin.project.snapshot_hash).toBe(
    first.project.snapshot_hash,
  );
  expect(Object.keys(original.job.result.counts).sort()).toEqual(["00", "11"]);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).fill(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save & run", exact: true }),
  ).toBeVisible();
  const savedRun = await runPython(page);
  expect(savedRun.status).toBe("completed");
  const project = await get(page, "/api/projects/" + savedRun.project.id);
  expect(project.files.find((file) => file.path === "helper.py").revision).toBe(
    savedRun.project.files.find((file) => file.path === "helper.py").sha256,
  );
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(helper + "# unsaved dependency\n");
  await page.reload();
  await expect(editor(page)).toHaveValue(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  const local = main + "# Newer user draft\n";
  await editor(page).fill(local);
  await page
    .getByRole("button", { name: "FlagQAI Agent", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await input.fill(
    "Run project acceptance and verify the actual saved project artifact.",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Scripted project acceptance completed with actual SDK computation.",
    { timeout: 90000 },
  );
  await expect(editor(page)).toHaveValue(local);
  await page
    .getByRole("button", { name: "Review changes in helper.py", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review Agent code changes" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Review changes in helper.py",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review Agent code changes" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review changes in main.py", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep my draft", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
  await expect(
    page.getByRole("button", {
      name: "Review changes in main.py",
      exact: true,
    }),
  ).toHaveCount(0);
  // Save & run writes the reviewed entry and includes the Agent's saved helper.
  const final = await runPython(page);
  expect(final.status).toBe("completed");
  expect(final.project.snapshot_hash).not.toBe(first.project.snapshot_hash);
  const record = await savedRecord(page, final);
  expect(Object.keys(record.job.result.counts).sort()).toEqual(["01", "10"]);
  await expect(page.getByText("Run complete", { exact: true })).toBeVisible();
  await editor(page).fill(local + "# changed after run\n");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "These results are from an earlier snapshot" }),
  ).toBeVisible();
  await editor(page).fill(local);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "These results are from an earlier snapshot" }),
  ).toHaveCount(0);
  await openCircuit(page, final);
  await openProgramMetadata(page);
  await expect(
    page.getByText("PROJECT SNAPSHOT", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(local);
  await page
    .getByRole("button", {
      name: "Close main.py (draft retained)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open main.py", exact: true }).click();
  await expect(editor(page)).toHaveValue(local);
});

test("workspace restores file view and folds; keyboard file search and save-and-run preserve source", async ({
  page,
}, testInfo) => {
  const main =
    Array.from({ length: 140 }, (_, index) => `# Context line ${index}`).join(
      "\n",
    ) +
    "\n" +
    bell +
    "# " +
    "long comment ".repeat(100);
  const helper = "# Project helper\nVALUE = 1\n";
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("continuity-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  const create = async (path, source) => {
    await page.getByRole("button", { name: "New file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "New project file", exact: true })
      .fill(path);
    await page
      .getByRole("button", { name: "Create project file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Switch to " + path, exact: true }),
    ).toBeVisible();
    await editor(page).fill(source);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
  };
  await create("src/main.py", main);
  await create("helper.py", helper);
  const newFileButton = page.getByRole("button", {
    name: "New file",
    exact: true,
  });
  await newFileButton.click();
  const pendingFile = page.getByRole("textbox", {
    name: "New project file",
    exact: true,
  });
  await pendingFile.fill("pending.py");
  await pendingFile.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(pendingFile).toHaveValue("pending.py");
  await expect(pendingFile).toBeFocused();
  await pendingFile.press("Escape");
  await expect(pendingFile).toHaveCount(0);
  await expect(newFileButton).toBeFocused();
  await expect(editor(page)).toHaveValue(helper);
  await newFileButton.click();
  await pendingFile.fill("helper.py");
  let createRequests = 0;
  let releaseCreate;
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const createRoute = "**/api/projects/*/file";
  await page.route(createRoute, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createRequests++;
    await createGate;
    await route.fulfill({
      status: 503,
      json: { error: "File creation temporarily unavailable" },
    });
  });
  try {
    const compositionContinues = await pendingFile.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(compositionContinues).toBe(false);
    expect(createRequests).toBe(0);
    await pendingFile.press("Enter");
    await expect(
      page.getByRole("button", { name: "Create project file", exact: true }),
    ).toHaveText("Creating…");
    await expect(pendingFile).toHaveAttribute("readonly", "");
    await pendingFile.press("Enter");
    expect(createRequests).toBe(1);
    releaseCreate();
    await expect(
      page.locator(".fq-project-explorer").getByRole("alert"),
    ).toHaveText("File creation temporarily unavailable");
    await expect(pendingFile).toHaveValue("helper.py");
    await expect(pendingFile).not.toHaveAttribute("readonly");
    await expect(editor(page)).toHaveValue(helper);
  } finally {
    releaseCreate();
    await page.unroute(createRoute);
  }
  await pendingFile.press("Enter");
  await expect(
    page.locator(".fq-project-explorer").getByRole("alert"),
  ).toContainText("already exists");
  await expect(pendingFile).toHaveValue("helper.py");
  await expect(editor(page)).toHaveValue(helper);
  await pendingFile.press("Escape");
  // Tab must indent selected code, never replace it with whitespace.
  await editor(page).focus();
  await editor(page).evaluate((element) => {
    element.setSelectionRange(0, element.value.length, "backward");
  });
  await editor(page).press("Tab");
  await expect(editor(page)).toHaveValue(
    "    # Project helper\n    VALUE = 1\n",
  );
  await expect
    .poll(() =>
      editor(page).evaluate((element) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
        direction: element.selectionDirection,
      })),
    )
    .toEqual({ start: 4, end: helper.length + 8, direction: "backward" });
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(helper);
  await expect
    .poll(() => editor(page).evaluate((element) => element.selectionStart))
    .toBe(0);
  await editor(page).evaluate((element) => element.setSelectionRange(0, 0));
  await editor(page).press("Tab");
  await expect(editor(page)).toHaveValue("    " + helper);
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(helper);
  for (let repeat = 0; repeat < 5; repeat++) {
    await editor(page).press("Tab");
    await editor(page).press("Shift+Tab");
  }
  await expect(editor(page)).toHaveValue(helper);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const retainedHelper = helper + "# retained after closing\n";
  await editor(page).fill(retainedHelper);
  await page
    .getByRole("button", {
      name: "Close helper.py (draft retained)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Switch to helper.py", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(editor(page)).toHaveValue(main);
  const retainedDrafts = page.getByRole("button", {
    name: "Retained drafts (1)",
    exact: true,
  });
  await retainedDrafts.click();
  const draftDialog = page.getByRole("dialog", {
    name: "Retained project drafts",
    exact: true,
  });
  await expect(draftDialog).toContainText("Unsaved changes");
  await page.screenshot({
    path: testInfo.outputPath("retained-drafts.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(draftDialog).toHaveCount(0);
  await expect(retainedDrafts).toBeFocused();
  await expect(editor(page)).toHaveValue(main);
  await retainedDrafts.click();
  await page.route("**/api/projects/*/file?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Acceptance file read unavailable" }),
    }),
  );
  await draftDialog
    .getByRole("button", {
      name: "Reopen continuity-project / helper.py",
      exact: true,
    })
    .click();
  await expect(draftDialog).toHaveCount(0);
  await expect(editor(page)).toHaveValue(retainedHelper);
  await expect(retainedDrafts).toHaveCount(0);
  await page.unroute("**/api/projects/*/file?*");
  await editor(page).fill(helper);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const tabs = page.locator(".fq-project-tabs > div > button:first-child");
  const order = await tabs.allTextContents();
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await editor(page).press("Control+End");
  await editor(page).press("Shift+ArrowLeft");
  const view = () =>
    editor(page).evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
      top: Math.round(element.scrollTop),
      left: Math.round(element.scrollLeft),
    }));
  const position = await view();
  expect(position.top).toBeGreaterThan(500);
  expect(position.left).toBeGreaterThan(100);
  expect(position.direction).toBe("backward");
  await editor(page).press("Tab");
  await expect.poll(view).toEqual({
    ...position,
    start: position.start + 4,
    end: position.end + 4,
  });
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).press("Control+Home");
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await expect.poll(view).toEqual(position);
  const folder = page
    .locator("details.fq-project-folder")
    .filter({ has: page.locator("summary").filter({ hasText: /^src$/ }) });
  await folder.locator("summary").click();
  await expect(folder).not.toHaveAttribute("open");
  const treeSearch = page.getByRole("textbox", {
    name: "Find project file",
    exact: true,
  });
  await treeSearch.fill("  SRC  ");
  await expect(folder).toHaveAttribute("open");
  await expect(
    page.getByRole("button", { name: "Open src/main.py", exact: true }),
  ).toBeVisible();
  await treeSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(treeSearch).toHaveValue("  SRC  ");
  await treeSearch.press("Escape");
  await expect(treeSearch).toHaveValue("");
  await expect(treeSearch).toBeFocused();
  await expect(folder).not.toHaveAttribute("open");
  await treeSearch.fill("no-such-project-file");
  await expect(
    page.getByRole("status").filter({ hasText: /^No matching files\./ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear project file search", exact: true })
    .click();
  await expect(treeSearch).toHaveValue("");
  await expect(treeSearch).toBeFocused();
  await expect(folder).not.toHaveAttribute("open");
  await expect.poll(view).toEqual(position);
  await editor(page).press("Control+p");
  const search = page.getByRole("combobox", { name: "Find file", exact: true });
  await search.fill("helper");
  expect(
    await page
      .locator(".fq-quick-open")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await search.press("ArrowDown");
  let releaseFileRead;
  const fileReadGate = new Promise((resolve) => {
    releaseFileRead = resolve;
  });
  const helperReads = "**/api/projects/*/file?path=helper.py";
  await page.route(helperReads, async (route) => {
    const response = await route.fetch();
    await fileReadGate;
    await route.fulfill({ response });
  });
  try {
    await search.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Find project file", exact: true }),
    ).toContainText("Opening…");
    await search.press("Escape");
    await editor(page).press("Control+p");
    await search.fill("src main");
    const pendingSearch = page.getByRole("dialog", {
      name: "Find project file",
      exact: true,
    });
    await expect(pendingSearch).toContainText(
      "Waiting for current project operation…",
    );
    await expect(pendingSearch.getByRole("option").first()).toBeDisabled();
    await search.press("Enter");
    await expect(search).toHaveValue("src main");
    await expect(pendingSearch).toBeVisible();
    releaseFileRead();
    await expect(editor(page)).toHaveValue(helper);
    await expect(search).toBeVisible();
    await expect(search).toHaveValue("src main");
    await expect(search).toBeFocused();
    await expect(pendingSearch.getByRole("option").first()).toBeEnabled();
    await search.press("Escape");
  } finally {
    releaseFileRead();
    await page.unroute(helperReads);
  }
  await expect(editor(page)).toHaveValue(helper);
  await expect(tabs).toHaveText(order);
  await editor(page).press("Control+p");
  await search.fill("src main");
  const mainReads = "**/api/projects/*/file?*";
  let mainOffline = true;
  await page.route(mainReads, (route) => {
    if (
      mainOffline &&
      new URL(route.request().url()).searchParams.get("path") === "src/main.py"
    )
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Acceptance main read failed" }),
      });
    return route.continue();
  });
  try {
    await search.press("Enter");
    const openError = page.locator(".fq-quick-error");
    await expect(openError).toContainText("Could not refresh src/main.py");
    await expect(openError).toContainText("Acceptance main read failed");
    await expect(
      page
        .locator(".fq-project-explorer")
        .getByRole("alert")
        .filter({ hasText: "Acceptance main read failed" }),
    ).toHaveCount(1);
    // The editor keeps its sync warning, rather than repeating it as an alert.
    await expect(
      page.locator(".fq-editor-sync").getByRole("status"),
    ).toContainText("Acceptance main read failed");
    await expect(page.locator(".fq-project-error")).toHaveCount(0);
    await expect(editor(page)).toHaveValue(main);
    await search.fill("helper");
    await expect(openError).toHaveCount(0);
    await search.fill("src main");
    await search.press("Enter");
    await expect(openError).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("file-read-retry.png"),
      fullPage: true,
    });
    mainOffline = false;
    await page
      .getByRole("button", { name: "Retry opening src/main.py", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Find project file", exact: true }),
    ).toHaveCount(0);
  } finally {
    mainOffline = false;
    await page.unroute(mainReads);
  }
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await page.reload();
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await expect(tabs).toHaveText(order);
  await expect(folder).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect.poll(view).toEqual(position);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).fill(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save & run", exact: true }),
  ).toBeVisible();
  const before = new Set(
    (await get(page, "/api/python/runs")).map((run) => run.id),
  );
  await editor(page).press("Control+Enter");
  let run;
  await expect
    .poll(
      async () => {
        run = (await get(page, "/api/python/runs")).find(
          (item) => !before.has(item.id),
        );
        return run?.status || "not submitted";
      },
      { timeout: 90000 },
    )
    .not.toMatch(/^(not submitted|queued|running)$/);
  run = await get(page, "/api/python/runs/" + run.id);
  expect(run.status, JSON.stringify(run)).toBe("completed");
  expect(run.source).toBe(main);
  await expect(editor(page)).toHaveValue(main);
  const tree = await get(page, "/api/projects/" + run.project.id);
  expect(tree.files.find((file) => file.path === "helper.py").revision).toBe(
    run.project.files.find((file) => file.path === "helper.py").sha256,
  );
  await expect(page.getByText("Run complete", { exact: true })).toBeVisible();
  await editor(page).press("Control+p");
  await search.fill("does-not-exist");
  await expect(
    page.getByText("No matching files.", { exact: true }),
  ).toBeVisible();
  const imeEscapePrevented = await search.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(imeEscapePrevented).toBe(true);
  await expect(
    page.getByRole("dialog", { name: "Find project file" }),
  ).toBeVisible();
  await expect(search).toHaveValue("does-not-exist");
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Find project file" }),
  ).toHaveCount(0);
  const runsBeforeFind = (await get(page, "/api/python/runs")).map(
    (item) => item.id,
  );
  await editor(page).press("Control+f");
  const codeSearch = page.getByRole("textbox", {
    name: "Find in current code",
    exact: true,
  });
  const codeMatches = page.getByRole("status", {
    name: "Code search matches",
    exact: true,
  });
  await codeSearch.fill("Context line");
  await expect(codeMatches).toHaveText("1 of 140");
  await codeSearch.press("Enter");
  await expect(codeMatches).toHaveText("2 of 140");
  await codeSearch.press("Shift+Enter");
  await expect(codeMatches).toHaveText("1 of 140");
  await codeSearch.press("Shift+Enter");
  await expect(codeMatches).toHaveText("140 of 140");
  await expect(codeSearch).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".fq-code-search-match")
        .first()
        .evaluate((element) => {
          const match = element.getBoundingClientRect();
          const editor = document
            .querySelector('textarea[aria-label="Quantum model code editor"]')
            .getBoundingClientRect();
          return match.top >= editor.top && match.bottom <= editor.bottom;
        }),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("code-search.png"),
    fullPage: true,
  });
  await codeSearch.fill("does-not-exist");
  await expect(codeMatches).toHaveText("No matches");
  await expect(
    page.getByRole("button", { name: "Next code match", exact: true }),
  ).toBeDisabled();
  await codeSearch.fill("IMPORT");
  await expect(codeMatches).toHaveText("1 of 1");
  await page.getByRole("button", { name: "Match case", exact: true }).click();
  await expect(codeMatches).toHaveText("No matches");
  await page.getByRole("button", { name: "Match case", exact: true }).click();
  await codeSearch.fill("as fq");
  await expect
    .poll(async () =>
      (await page.locator(".fq-code-search-match").allTextContents()).join(""),
    )
    .toBe("as fq");
  await codeSearch.press("Escape");
  await expect(codeSearch).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveValue(main);
  await editor(page).press("Control+f");
  await expect(codeSearch).toHaveValue("as fq");
  // Searching must not take the caret back when editing, or exit focused mode.
  const focusEditor = page.getByRole("button", {
    name: "Focus model editor",
    exact: true,
  });
  await focusEditor.click();
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await editor(page).focus();
  await editor(page).evaluate((element) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await editor(page).pressSequentially("# search stays passive");
  await expect(editor(page)).toHaveValue(main + "# search stays passive");
  expect(await editor(page).evaluate((element) => element.selectionStart)).toBe(
    (main + "# search stays passive").length,
  );
  await editor(page).evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await expect(codeSearch).toBeVisible();
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await editor(page).press("Escape");
  await expect(codeSearch).toHaveCount(0);
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toBeFocused();
  await editor(page).fill(main);
  await focusEditor.click();
  await editor(page).press("Control+f");
  await page
    .getByRole("button", { name: "Close code search", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(main);
  expect((await get(page, "/api/python/runs")).map((item) => item.id)).toEqual(
    runsBeforeFind,
  );
  let saves = 0,
    releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/projects/*/file", async (route) => {
    if (route.request().method() === "POST") {
      saves++;
      await saveGate;
    }
    await route.continue();
  });
  const saveKey = (extra = {}) =>
    editor(page).evaluate((element, extra) => {
      const event = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, extra);
  try {
    const source = main + "\n# keyboard save acceptance\n";
    await editor(page).fill(source);
    for (const extra of [
      { isComposing: true },
      { altKey: true },
      { shiftKey: true },
    ])
      expect(await saveKey(extra)).toBe(false);
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(0);
    await editor(page).press("Control+s");
    await expect.poll(() => saves).toBe(1);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    expect(await saveKey()).toBe(true);
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(1);
    releaseSave();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(1);
    await expect(editor(page)).toHaveValue(source);
  } finally {
    releaseSave();
    await page.unroute("**/api/projects/*/file");
  }
  // A large read-only tree fixture checks the visible limit without creating files.
  const treePath = "/api/projects/" + run.project.id;
  const savedTree = await get(page, treePath);
  await page.route("**" + treePath, (route) =>
    route.fulfill({
      json: {
        ...savedTree,
        files: [
          ...savedTree.files,
          ...Array.from({ length: 45 }, (_, index) => ({
            path: `large-list-${String(index).padStart(2, "0")}.py`,
            kind: "source",
            size: 0,
          })),
        ],
      },
    }),
  );
  try {
    await editor(page).press("Control+p");
    const fileDialog = page.getByRole("dialog", {
      name: "Find project file",
      exact: true,
    });
    await expect(fileDialog.getByRole("status")).toContainText(
      "Showing 40 of 47 matching files",
    );
    await expect(fileDialog.getByRole("option")).toHaveCount(40);
    await search.press("End");
    await expect(fileDialog.getByRole("option").last()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await search.press("Home");
    await expect(fileDialog.getByRole("option").first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await search.fill("large-list-44.py");
    await expect(fileDialog.getByRole("status")).toHaveText("1 matching file");
    await expect(fileDialog.getByRole("option")).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath("file-match-count.png"),
      fullPage: true,
    });
    await search.press("Escape");
  } finally {
    await page.unroute("**" + treePath);
  }
  await newFileButton.click();
  await pendingFile.fill("old-project-only.py");
  const projectSearch = page.getByRole("textbox", {
    name: "Find project file",
    exact: true,
  });
  await projectSearch.fill("helper");
  await page
    .getByRole("button", { name: "Change project", exact: true })
    .click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("new-file-scope-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(pendingFile).toHaveCount(0);
  await expect(projectSearch).toHaveValue("");
  await newFileButton.click();
  await expect(pendingFile).toHaveValue("");
  await pendingFile.press("Escape");
  await expect(newFileButton).toBeFocused();
  const changeProject = page.getByRole("button", {
    name: "Change project",
    exact: true,
  });
  await changeProject.click();
  const chooser = page.getByRole("dialog", {
    name: "Open local project",
    exact: true,
  });
  const directory = chooser.getByRole("textbox", {
    name: "Project directory",
    exact: true,
  });
  let releaseProject;
  let projectRequests = 0;
  const projectGate = new Promise((resolve) => {
    releaseProject = resolve;
  });
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    projectRequests++;
    const response = await route.fetch();
    await projectGate;
    await route.fulfill({ response });
  });
  try {
    await chooser
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(
      chooser.getByRole("button", { name: "Opening…", exact: true }),
    ).toBeDisabled();
    await directory.press("Escape");
    await expect(chooser).toHaveCount(0);
    await changeProject.click();
    await directory.fill("keep-this-folder");
    await expect(
      chooser.getByRole("button", { name: "Waiting…", exact: true }),
    ).toBeDisabled();
    await directory.press("Enter");
    expect(projectRequests).toBe(1);
    releaseProject();
    await expect(
      chooser.getByRole("button", { name: "Open folder", exact: true }),
    ).toBeEnabled();
    await expect(directory).toHaveValue("keep-this-folder");
    await expect(directory).toBeFocused();
    const defaultAllowed = await directory.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(defaultAllowed).toBe(false);
    expect(projectRequests).toBe(1);
    await directory.press("Escape");
    await expect(changeProject).toBeFocused();
  } finally {
    releaseProject();
    await page.unroute("**/api/projects");
  }
  await changeProject.click();
  let releaseOldFailure;
  const oldFailureGate = new Promise((resolve) => {
    releaseOldFailure = resolve;
  });
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await oldFailureGate;
    await route.fulfill({
      status: 503,
      json: { error: "Previous folder could not be opened" },
    });
  });
  try {
    await chooser
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(
      chooser.getByRole("button", { name: "Opening…", exact: true }),
    ).toBeDisabled();
    await directory.fill("newer-folder-choice");
    releaseOldFailure();
    await expect(
      chooser.getByRole("button", { name: "Open folder", exact: true }),
    ).toBeEnabled();
    await expect(directory).toHaveValue("newer-folder-choice");
    await expect(directory).toHaveAttribute("aria-invalid", "false");
    await expect(chooser.getByRole("alert")).toHaveCount(0);
  } finally {
    releaseOldFailure();
    await page.unroute("**/api/projects");
  }
  await directory.fill("missing-folder-for-chooser-recovery");
  await directory.press("Enter");
  await expect(chooser.getByRole("alert")).toBeVisible();
  await expect(directory).toHaveAttribute("aria-invalid", "true");
  await directory.fill("new-file-scope-project");
  await expect(chooser.getByRole("alert")).toHaveCount(0);
  await expect(directory).toHaveAttribute("aria-invalid", "false");
  await directory.press("Enter");
  await expect(chooser).toHaveCount(0);
  await expect(changeProject).toBeFocused();
});

test("failed run → Agent repair → review and undo → changed SDK result remains traceable after refresh", async ({
  page,
}) => {
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
  const failed = await runPython(
    page,
    "# repair-case: syntax\nimport flagquantum as fq\nfq.Circuit(",
  );
  expect(failed.status).toBe("failed");
  await page
    .getByRole("button", { name: "Ask Agent to fix", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message FlagQAI", exact: true }),
  ).toHaveValue(new RegExp(failed.id.slice(0, 8)));
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Repaired failed run " + failed.id,
    { timeout: 90000 },
  );
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByText("Differs from editor", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fq-agent-work > summary")).toContainText(
    "Worked",
  );
  const completed = (await get(page, "/api/python/runs")).find(
    (item) => item.id !== failed.id && item.status === "completed",
  );
  expect(completed).toBeTruthy();
  const repaired = await get(page, "/api/python/runs/" + completed.id);
  const original = await savedRecord(page, repaired, "repaired.fqx");
  expect(Object.keys(original.job.result.counts).sort()).toEqual(["00", "11"]);
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await expect(agent).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Repaired failed run " + failed.id,
  );
  await openProgramMetadata(page);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${original.id}/file`);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept Agent changes", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(repaired.source);
  const staleResult = page
    .getByRole("status")
    .filter({ hasText: "These results are from an earlier snapshot" });
  await expect(staleResult).toHaveCount(0);
  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(staleResult).toBeVisible();
  await page.getByRole("button", { name: "View changes", exact: true }).click();
  const review = page.getByRole("dialog", {
    name: "Review Agent code changes",
  });
  await expect(review).toContainText("You undid this Agent change");
  await expect(review).not.toContainText("These changes have synced");
  await expect(review).not.toContainText(
    "You edited the code after synchronization",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Make an observable change and execute the actual edited source, rather than
  // reusing the Agent's saved Bell result or comparing only a success label.
  const changed = repaired.source.replace(
    "result = fq.run",
    "circuit.x(1)\nresult = fq.run",
  );
  const rerun = await runPython(page, changed);
  expect(rerun.status).toBe("completed");
  expect(rerun.source).toBe(changed);
  expect(rerun.source_hash).not.toBe(repaired.source_hash);
  const latest = await savedRecord(page, rerun, "repaired.fqx");
  expect(latest.id).not.toBe(original.id);
  expect(Object.keys(latest.job.result.counts).sort()).toEqual(["01", "10"]);
  await openCircuit(page, rerun, "repaired.fqx");
  await expect(page.getByText("Matches editor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View saved result →" }).click();
  await expect(page).toHaveURL(/#jobs$/);
  await page.reload();
  await expect(page).toHaveURL(/#jobs$/);
  const recoveredResult = await showJobEvidence(page);
  await expect(
    recoveredResult.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${latest.id}/file`);
  for (const count of Object.values(latest.job.result.counts))
    await expect(recoveredResult.getByRole("table")).toContainText(
      count.toLocaleString("en-US"),
    );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(changed);
  await page.getByLabel("Python run history").selectOption(failed.id);
  await expect(
    page.getByRole("region", { name: "Python failure", exact: true }),
  ).toBeVisible();
  await expect(editor(page)).toHaveValue(changed);
  expect((await get(page, "/api/python/runs/" + failed.id)).source).toBe(
    failed.source,
  );
  expect(
    (await savedRecord(page, repaired, "repaired.fqx")).job.result.counts,
  ).toEqual(original.job.result.counts);
});

test("native decisions, uncertain stops and reconnect preserve one task without resubmission", async ({
  page,
}) => {
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
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const network = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  const start = await get(page, network);
  const send = async (kind) => {
    await input.fill("control acceptance: " + kind);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
  };
  await send("permission");
  await expect(
    page.getByRole("status", { name: "Waiting for permission", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "The read was rejected",
  );
  await send("question");
  await expect(
    page.getByRole("status", { name: "Waiting for your answer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
  await expect(
    page.getByText("Agent stopped. Existing code and results are retained.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit answers", exact: true }),
  ).toHaveCount(0);
  for (const kind of ["unknown", "failed"]) {
    await send("stop-" + kind);
    await expect(
      page.getByRole("button", { name: "Stop Agent", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(page.locator(".fq-agent-stop-state")).toContainText(
      kind === "unknown" ? "Stop is unconfirmed" : "Stop failed",
    );
    await expect(page.locator(".fq-agent-stop-state")).not.toContainText(
      "Agent stopped",
    );
    if (kind === "unknown")
      await expect(page.locator(".fq-agent-stop-state")).toContainText(
        "1 message remains queued",
      );
    const native = (await get(page, network)).sessions.find(
      (session) => session.status === "running",
    );
    expect(native).toBeTruthy();
    await input.fill("Keep this unsent draft while stopping.");
    await editor(page).fill(draft);
    // Drop the live stream, then restore it. Neither reconnect nor refresh may
    // create another native submission or silently retry the stop request.
    const beforeReconnect = await get(page, network);
    try {
      await page.request.post(network, { data: { offline: true } });
      await expect(
        page.getByRole("status", { name: "Reconnecting…", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Stop Agent", exact: true }),
      ).toBeDisabled();
    } finally {
      await fetch(network, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offline: false }),
        signal: AbortSignal.timeout(5000),
      });
    }
    await page.reload();
    await expect(
      page.getByRole("status", { name: "Working", exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("Keep this unsent draft while stopping.");
    await expect(editor(page)).toHaveValue(draft);
    const restored = await get(page, network);
    expect(restored.submissionCount).toBe(beforeReconnect.submissionCount);
    expect(restored.cancellationCount).toBe(beforeReconnect.cancellationCount);
    expect(
      restored.sessions.find((session) => session.id === native.id)?.status,
    ).toBe("running");
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(
      page.getByText("Agent stopped. Existing code and results are retained.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
  }
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-stop");
  await writeFile(
    hold,
    "Keep native turn running after the confirmed cancellation receipt",
  );
  try {
    await send("stop-delayed");
    const beforeStop = await get(page, network);
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Stopping…", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".fq-agent-stop-state")).toContainText(
      "Waiting for the native Agent to finish",
    );
    await expect(
      page.getByRole("button", { name: "Stop Agent", exact: true }),
    ).toBeDisabled();
    expect((await get(page, network)).cancellationCount).toBe(
      beforeStop.cancellationCount + 1,
    );
    await expect(page.locator(".fq-agent-stop-state")).not.toContainText(
      "Agent stopped",
    );
  } finally {
    await rm(hold, { force: true });
  }
  await expect(
    page.getByText("Agent stopped. Existing code and results are retained.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor(page)).toHaveValue(draft);
  expect((await get(page, network)).submissionCount).toBe(
    start.submissionCount + 5,
  );
});

test("Follow Agent from Execution handles the first action batch, cold archive focus and Follow Off", async ({
  page,
}) => {
  await editor(page).fill(draft);
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  // Delay the first live poll so it contains newly created actions, not just
  // history. Real protocol/SDK traffic is delayed, never replaced by fixtures.
  let identity;
  await page.route("**/api/workspace/context", async (route) => {
    identity = route.request().postDataJSON();
    await route.continue();
  });
  let polls = 0,
    releasePoll;
  const pollGate = new Promise((resolve) => {
    releasePoll = resolve;
  });
  await page.route("**/api/workspace/events?*", async (route) => {
    if (++polls === 2) await pollGate;
    await route.continue();
  });
  const modelBarrier = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-follow-model",
  );
  const resultBarrier = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-follow-result",
  );
  await writeFile(modelBarrier, "Observe model navigation");
  await writeFile(resultBarrier, "Observe circuit navigation");
  try {
    await page
      .getByRole("button", { name: "Connect Agent", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    const follow = page.getByRole("switch", { name: /Follow Agent/ });
    if ((await follow.getAttribute("aria-checked")) !== "true")
      await follow.click();
    await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: "Message FlagQAI",
      exact: true,
    });
    await input.fill("follow acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(async () => {
        if (!identity) return false;
        const actions = await get(
          page,
          `/api/workspace/events?client=${identity.client}&session=${identity.session}&after=0`,
        );
        return actions.some(
          (action) =>
            action.operation === "model.create" &&
            action.status === "completed",
        );
      })
      .toBe(true);
    releasePoll();
    await expect(page).toHaveURL(/#model$/);
    await expect(editor(page)).toHaveValue(
      /circuit = fq.Circuit\(2\).h\(0\).cx\(0, 1\).x\(1\)/,
    );
    await rm(modelBarrier, { force: true });
    await expect(page).toHaveURL(/#program$/, { timeout: 90000 });
    await expect(
      page.getByRole("button", { name: "Inspect X gate 3", exact: true }),
    ).toBeVisible();
    await openProgramMetadata(page);
    const archive = await page
      .getByRole("link", { name: "Download original .fqx ↓" })
      .getAttribute("href");
    await rm(resultBarrier, { force: true });
    await expect(page).toHaveURL(/#jobs$/);
    const followedResult = await showJobEvidence(page);
    await expect(
      followedResult.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", archive);
    await expect(followedResult.getByRole("table")).toContainText("01");
    await expect(followedResult.getByRole("table")).toContainText("10");
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    await follow.click();
    await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
    await input.fill("follow acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.locator(".fq-agent-message.assistant")).toHaveCount(2, {
      timeout: 90000,
    });
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#execution$/);
    await page.reload();
    await expect(page).toHaveURL(/#execution$/);
    await expect(agent).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("button", { name: "Show model library", exact: true })
      .click();
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: /Draft · Python Bell pair/,
        exact: false,
      }),
    ).toBeVisible();
  } finally {
    releasePoll();
    await rm(modelBarrier, { force: true });
    await rm(resultBarrier, { force: true });
  }
});

test("comparison task opens a durable side-by-side experiment with real gate and distribution changes", async ({
  page,
}, testInfo) => {
  await editor(page).fill(draft);
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
  await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message FlagQAI", exact: true })
    .fill("comparison acceptance");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toBeVisible();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(comparison).toBeVisible({ timeout: 90000 });
  await expect(
    comparison.getByRole("heading", {
      name: "1 added · 0 removed operations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(comparison).toContainText("+ X on q1");
  await expect(comparison).toContainText("100.0%");
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toContainText("1 run · 2 saved results");
  await expect(
    comparison.getByRole("combobox", {
      name: "Baseline experiment",
      exact: true,
    }),
  ).toHaveValue(/fqx-/);
  const left = await comparison
    .getByRole("combobox", { name: "Baseline experiment", exact: true })
    .inputValue();
  const right = await comparison
    .getByRole("combobox", { name: "Variant experiment", exact: true })
    .inputValue();
  const a = await get(page, "/api/experiments/" + left),
    b = await get(page, "/api/experiments/" + right);
  expect(a.job.result.shots).not.toBe(b.job.result.shots);
  expect(Object.keys(a.job.result.counts).sort()).toEqual(["00", "11"]);
  expect(Object.keys(b.job.result.counts).sort()).toEqual(["01", "10"]);
  const worked = page.locator(".fq-agent-work > summary");
  await expect(worked).toBeVisible();
  await worked.click();
  const waitCard = page
    .locator('.fq-cli-tool[aria-label="workbench_wait_run tool call"]')
    .last();
  await expect(waitCard.locator(".fq-activity-header strong")).toHaveText(
    "Wait for result",
  );
  await expect(waitCard.locator(".fq-activity-meta")).toContainText(
    "Results ready",
  );
  await waitCard.locator(".fq-activity-header").click();
  const raw = waitCard.locator(".fq-activity-details details").filter({
    has: page.locator("summary").filter({ hasText: /^Raw result$/ }),
  });
  await raw.locator("summary").click();
  await expect(raw.locator("pre")).toContainText(a.program.origin.run_id);
  await expect(raw.locator("pre")).toContainText(a.program.origin.source_hash);
  await raw.locator("summary").click();
  await waitCard.locator(".fq-activity-header").click();
  await expect
    .poll(() =>
      waitCard
        .locator(".fq-activity-header")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
  await waitCard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("workbench-status.png"),
    fullPage: true,
  });
  await worked.click();
  await page.screenshot({
    path: testInfo.outputPath("experiment-comparison.png"),
    fullPage: true,
  });
  const collectionRunPath = "**/api/python/runs/" + a.program.origin.run_id;
  const savedRun = await get(
    page,
    "/api/python/runs/" + a.program.origin.run_id,
  );
  let collectionPhase = "collecting";
  let failedComparisonReads = 0,
    readFaultUntil = 0;
  await page.route("**/api/experiments", (route) => {
    if (!readFaultUntil) readFaultUntil = Date.now() + 75;
    if (Date.now() < readFaultUntil) {
      failedComparisonReads++;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.route(collectionRunPath, (route) => {
    if (collectionPhase === "offline")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Acceptance connection outage" }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        collectionPhase === "collecting"
          ? {
              ...savedRun,
              collection_status: "collecting",
              experiments: [],
              artifact: undefined,
            }
          : savedRun,
      ),
    });
  });
  await page.reload();
  const completedWork = page.locator(".fq-agent-work").last();
  await expect(completedWork).not.toHaveAttribute("open");
  await completedWork.locator(":scope > summary").click();
  const experimentActivity = completedWork
    .locator(".fq-experiment-activity")
    .last();
  await expect(experimentActivity).toHaveAttribute("open");
  const pythonActivity = experimentActivity
    .locator(".fq-workspace-artifact")
    .filter({
      has: page.locator("strong").filter({ hasText: /^Python execution$/ }),
    })
    .first();
  await expect(
    pythonActivity.getByRole("status", {
      name: "Python activity status",
      exact: true,
    }),
  ).toHaveText("Collecting results…");
  collectionPhase = "offline";
  await expect(
    pythonActivity.getByRole("status", {
      name: "Python activity status",
      exact: true,
    }),
  ).toHaveText("Reconnecting…");
  await expect(pythonActivity).toContainText("no new run will be submitted");
  collectionPhase = "ready";
  await expect(
    pythonActivity.getByRole("status", {
      name: "Python activity status",
      exact: true,
    }),
  ).toHaveText("Results ready");
  await expect(
    pythonActivity
      .getByRole("button", { name: "Open circuit ↗", exact: true })
      .first(),
  ).toBeVisible();
  await pythonActivity.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("collection-recovered.png"),
    fullPage: true,
  });
  expect(
    (await get(page, "/api/python/runs")).filter(
      (run) => run.id === savedRun.id,
    ),
  ).toHaveLength(1);
  await page.unroute(collectionRunPath);
  const pageChanges = experimentActivity.locator(".fq-page-changes");
  await expect(pageChanges.locator("summary")).toHaveText("Page changes · 2");
  await expect(
    pageChanges.getByRole("button", { includeHidden: true }),
  ).toHaveCount(2);
  await expect(pageChanges.getByRole("button").first()).not.toBeVisible();
  await pageChanges.locator("summary").click();
  await expect(
    pageChanges.getByRole("button", { name: "Open Quantum view", exact: true }),
  ).toBeVisible();
  await expect(
    pageChanges.getByRole("button", { name: "Open Results view", exact: true }),
  ).toBeVisible();
  await pageChanges.locator("summary").click();
  await expect(
    experimentActivity.locator(".fq-workspace-artifact"),
  ).toHaveCount(3);
  await expect(experimentActivity).toContainText("Results compared");
  await expect(
    experimentActivity.getByRole("button", {
      name: "Open comparison ↗",
      exact: true,
    }),
  ).toBeVisible();
  await experimentActivity.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("activity-hierarchy.png"),
    fullPage: true,
  });
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole("combobox", {
      name: "Baseline experiment",
      exact: true,
    }),
  ).toHaveValue(left);
  await expect(
    comparison.getByRole("combobox", {
      name: "Variant experiment",
      exact: true,
    }),
  ).toHaveValue(right);
  expect(failedComparisonReads).toBeGreaterThan(0);
  await expect(
    comparison.getByRole("button", { name: "Retry comparison", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/experiments");
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toContainText("2 saved results");
  await comparison
    .getByRole("button", { name: "Swap comparison sides", exact: true })
    .click();
  await expect(
    comparison.getByRole("heading", {
      name: "0 added · 1 removed operations",
      exact: true,
    }),
  ).toBeVisible();
  await comparison
    .getByRole("button", { name: "Single result", exact: true })
    .click();
  await expect(comparison).toHaveCount(0);
  const savedEntry = pythonActivity
    .locator(".fq-python-activity-experiments section")
    .filter({ hasText: a.program.experiment.filename })
    .first();
  await savedEntry
    .getByRole("button", { name: "Open circuit ↗", exact: true })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await expect(page.locator(".fq-visualizer")).toContainText(a.program.name);
  await savedEntry
    .getByRole("button", { name: "View results ↗", exact: true })
    .click();
  await expect(page).toHaveURL(/#jobs$/);
  await expect(await showJobEvidence(page)).toContainText(a.id);
  // Opening the exact historical run is inspection, including after a failed read.
  const inspectedWork = page.locator(".fq-agent-work").last();
  if (!(await inspectedWork.evaluate((element) => element.open)))
    await inspectedWork.locator(":scope > summary").click();
  const outputLink = page
    .locator('.fq-cli-tool[aria-label="workbench_wait_run tool call"]')
    .last()
    .getByRole("button", { name: "View Python output ↗", exact: true });
  const runPath = "**/api/python/runs/" + a.program.origin.run_id;
  await page.route(runPath, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Acceptance read outage" }),
    }),
  );
  await outputLink.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not open this run" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#jobs$/);
  await page.unroute(runPath);
  const runsBeforeInspection = await get(page, "/api/python/runs");
  await outputLink.click();
  await expect(
    page.getByRole("region", { name: "Python output", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Python run history", exact: true }),
  ).toHaveValue(a.program.origin.run_id);
  expect((await get(page, "/api/python/runs")).map((run) => run.id)).toEqual(
    runsBeforeInspection.map((run) => run.id),
  );
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Python run history", exact: true }),
  ).toHaveValue(a.program.origin.run_id);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await page
    .getByRole("button", { name: "Show model library", exact: true })
    .click();
  await page.getByRole("button", { name: /Draft · Python Bell pair/ }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("Jobs prioritizes results, filters history and compares only explicitly selected experiments", async ({
  page,
}, testInfo) => {
  const first = await runPython(
    page,
    bell.replace("bell.fqx", "jobs_reference.fqx"),
  );
  const second = await runPython(
    page,
    bell
      .replace("bell.fqx", "jobs_variant.fqx")
      .replace("result = fq.run", "circuit.x(1)\nresult = fq.run"),
  );
  const a = await savedRecord(page, first),
    b = await savedRecord(page, second);
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", { name: `Open job ${b.job.name}`, exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await expect(
    results.getByRole("region", { name: "Measurement distribution" }),
  ).toBeVisible();
  const distribution = results.getByRole("region", {
    name: "Measurement distribution",
    exact: true,
  });
  await expect(
    results.getByLabel("Saved measurement summary", { exact: true }),
  ).toContainText("counts");
  await expect(
    results.getByRole("combobox", { name: "Saved measurement", exact: true }),
  ).toHaveCount(0);
  const reading = distribution.locator(".fq-job-reading-note details");
  await expect(reading).not.toHaveAttribute("open");
  await reading.locator("summary").click();
  await expect(reading).toContainText("Probabilities use all recorded counts");
  await reading.locator("summary").click();
  expect(
    (await distribution.boundingBox()).y - (await results.boundingBox()).y,
  ).toBeLessThan(220);
  expect(
    (await page.locator(".fq-job-row.selected").boundingBox()).height,
  ).toBeLessThanOrEqual(60);
  const searchBounds = await page
    .getByRole("textbox", { name: "Search jobs", exact: true })
    .boundingBox();
  const filterBounds = await page
    .getByRole("combobox", { name: "Filter jobs by status", exact: true })
    .boundingBox();
  expect(Math.abs(searchBounds.y - filterBounds.y)).toBeLessThan(5);
  await page.screenshot({
    path: testInfo.outputPath("compact-jobs-results.png"),
    fullPage: true,
  });
  const sidebar = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  for (let step = 0; step < 3; step++) await sidebar.press("Shift+ArrowLeft");
  await expect(sidebar).toHaveAttribute("aria-valuenow", "170");
  for (const selector of [
    ".fq-jobs-search",
    ".fq-jobs-list",
    ".fq-jobs-compare-action",
  ]) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("compact-jobs-narrow.png"),
    fullPage: true,
  });
  await sidebar.dblclick();
  await expect(
    results.getByRole("link", { name: "Download original .fqx ↓" }),
  ).not.toBeVisible();
  await results.getByRole("button", { name: "Counts", exact: true }).click();
  await results.getByRole("button", { name: "Table", exact: true }).click();
  await expect(results.getByRole("table")).toContainText("Probability");
  await results.getByRole("button", { name: "Circuit", exact: true }).click();
  await expect(
    results.getByRole("group", { name: b.program.name + " circuit preview" }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Code", exact: true }).click();
  await expect(
    results.getByLabel("Model used for this result code"),
  ).toContainText("circuit.x(1)");
  await results.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByLabel("Filter jobs by status").selectOption("failed");
  await expect(
    page.getByText("No matching jobs. Try another search or status."),
  ).toBeVisible();
  await page.getByLabel("Filter jobs by status").selectOption("all");
  const compare = page.getByRole("button", {
    name: "Compare two experiments",
    exact: true,
  });
  await expect(compare).toBeDisabled();
  await page
    .getByRole("checkbox", { name: `Compare ${a.job.name}`, exact: true })
    .check();
  await page.getByLabel("Search jobs").fill("jobs_variant");
  await expect(
    page.getByRole("checkbox", { name: `Compare ${a.job.name}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: `Compare ${b.job.name}`, exact: true })
    .check();
  await page.getByLabel("Search jobs").fill("");
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Experiment comparison" }),
  ).toContainText("+ X on q1");
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await page.setViewportSize({ width: 1440, height: 800 });
  const overview = comparison.getByRole("region", {
    name: "Observed differences",
    exact: true,
  });
  expect((await overview.boundingBox()).y).toBeLessThan(
    (await comparison.locator(".fq-comparison-grid").boundingBox()).y,
  );
  const bars = comparison.locator(".fq-compare-bars");
  await expect(bars).toHaveCount(2);
  for (const chart of await bars.all()) {
    const box = await chart.boundingBox();
    expect(box.y + box.height).toBeLessThan(800);
  }
  const previews = comparison.locator(".fq-compare-circuit");
  const compactHeight = await previews
    .first()
    .evaluate((element) => element.clientHeight);
  expect(compactHeight).toBeLessThan(180);
  await page.screenshot({
    path: testInfo.outputPath("compact-experiment-comparison.png"),
    fullPage: true,
  });
  await comparison
    .getByRole("button", { name: "Expand circuit previews", exact: true })
    .click();
  expect(
    await previews.first().evaluate((element) => element.clientHeight),
  ).toBeGreaterThan(compactHeight + 20);
  await page.reload();
  await expect(
    comparison.getByRole("button", {
      name: "Compact circuit previews",
      exact: true,
    }),
  ).toBeVisible();
  await expect(previews).toHaveCount(2);
  expect(
    await previews.first().evaluate((element) => element.clientHeight),
  ).toBeGreaterThan(compactHeight + 20);
  await comparison
    .getByRole("button", { name: "Compact circuit previews", exact: true })
    .click();
  await page.reload();
  await expect(
    comparison.getByRole("button", {
      name: "Expand circuit previews",
      exact: true,
    }),
  ).toBeVisible();
  await expect(previews).toHaveCount(2);
  expect(
    await previews.first().evaluate((element) => element.clientHeight),
  ).toBe(compactHeight);
  const comparisonSidebar = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  const comparisonHandle = await comparisonSidebar.boundingBox();
  await page.mouse.move(
    comparisonHandle.x + comparisonHandle.width / 2,
    comparisonHandle.y + 50,
  );
  await page.mouse.down();
  await page.mouse.move(
    comparisonHandle.x + comparisonHandle.width / 2 + 24,
    comparisonHandle.y + 50,
  );
  await page.mouse.up();
  await expect(comparisonSidebar).toHaveAttribute("aria-valuenow", "304");
  await page.reload();
  await expect(comparisonSidebar).toHaveAttribute("aria-valuenow", "304");
  const baselineCard = comparison.getByRole("article", {
    name: "Baseline experiment",
    exact: true,
  });
  await baselineCard.locator("details > summary").click();
  await expect(
    baselineCard.getByRole("link", {
      name: "Download original .fqx",
      exact: true,
    }),
  ).toHaveAttribute("href", `/api/experiments/${a.id}/file`);
  await baselineCard.locator("details > summary").click();
  await page.setViewportSize({ width: 820, height: 700 });
  expect(
    await comparison.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => ({
      document: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    })),
  ).toEqual({ document: 700, viewport: 700 });
  await page.screenshot({
    path: testInfo.outputPath("compact-experiment-comparison-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Single result", exact: true })
    .click();
  await results.getByRole("button", { name: "Results", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("jobs-results.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("Jobs pages all observed states without renormalizing a truncated chart", async ({
  page,
}, testInfo) => {
  const run = await runPython(
    page,
    `import flagquantum as fq
circuit = fq.Circuit(6)
for q in range(6):
    circuit.h(q)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=4096, seed=42))
fq.save("jobs_many_states.fqx", result.plan, result=result)
`,
  );
  const record = await savedRecord(page, run);
  expect(Object.keys(record.job.result.counts)).toHaveLength(64);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", { name: `Open job ${record.job.name}`, exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await results.getByLabel("Sort measurement states").selectOption("state");
  await expect(results).toContainText("Showing 1–32 of 64 observed states");
  await expect(
    results.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  const count = record.job.result.counts["000000"];
  await expect(
    results.getByRole("button", {
      name: `000000: ${count} shots, ${((count / 4096) * 100).toFixed(2)}%`,
      exact: true,
    }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Next", exact: true }).click();
  await expect(results).toContainText("Showing 33–64 of 64 observed states");
  await expect(
    results.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await results.getByRole("button", { name: "Table", exact: true }).click();
  await expect(results.getByRole("table")).toContainText("111111");
  const tableViewport = results.locator(".fq-job-table-scroll");
  await tableViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await tableViewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(100);
  await results.getByRole("button", { name: "Counts", exact: true }).click();
  expect(
    await tableViewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(100);
  await results.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    results.getByRole("status", {
      name: "Measurement state range",
      exact: true,
    }),
  ).toContainText("Showing 1–32");
  await expect
    .poll(() => tableViewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(
    results.getByRole("table").locator("tbody tr").first(),
  ).toContainText("000000");
  await tableViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await results.getByRole("button", { name: "Next", exact: true }).click();
  await expect
    .poll(() => tableViewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(
    results.getByRole("table").locator("tbody tr").first(),
  ).toContainText("100000");
  const stateSearch = results.getByRole("searchbox", {
    name: "Find measurement state",
    exact: true,
  });
  await stateSearch.fill("000000");
  await expect(results).toContainText("1 matching state of 64 observed");
  const matched = results.getByRole("table").locator("tbody tr");
  await expect(matched).toHaveCount(1);
  await expect(
    results
      .locator(".fq-job-metrics > div")
      .filter({ has: page.getByText("Observed states", { exact: true }) })
      .locator("dd"),
  ).toHaveText("64");
  await results
    .getByRole("button", { name: "Export results", exact: true })
    .click();
  await expect(
    results.getByRole("group", { name: "Export formats", exact: true }),
  ).toContainText("Search and pagination do not limit exports");
  const csvDownload = page.waitForEvent("download");
  await results
    .getByRole("button", { name: "CSV · selected measurement", exact: true })
    .click();
  const csvFile = await csvDownload;
  const { readFile: readCSV } = await import("node:fs/promises");
  const csvLines = (await readCSV(await csvFile.path(), "utf8"))
    .trim()
    .split("\n");
  expect(csvLines[0]).toBe("state,count,probability");
  expect(csvLines).toHaveLength(65);
  const exportedStates = csvLines.slice(1).map((line) => line.split(","));
  expect(exportedStates.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(
    4096,
  );
  expect(new Set(exportedStates.map((row) => row[0]))).toEqual(
    new Set(Object.keys(record.job.result.counts)),
  );
  await expect(stateSearch).toHaveValue("000000");
  await expect(matched).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("state-search.png"),
    fullPage: true,
  });
  await expect(matched).toContainText(`${((count / 4096) * 100).toFixed(2)}%`);
  await page.reload();
  await expect(stateSearch).toHaveValue("000000");
  await expect(matched).toHaveCount(1);
  await stateSearch.fill("no-such-state");
  await expect(
    results
      .getByRole("status")
      .filter({ hasText: "No states match your search." }),
  ).toBeVisible();
  await expect(results).toContainText("0 matching states of 64 observed");
  await stateSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(stateSearch).toHaveValue("no-such-state");
  await stateSearch.press("Escape");
  await expect(stateSearch).toHaveValue("");
  await expect(stateSearch).toBeFocused();
  await expect(results).toContainText("Showing 1–32 of 64 observed states");
  await stateSearch.fill("no-such-state");
  await results
    .getByRole("button", { name: "Show all states", exact: true })
    .click();
  await expect(stateSearch).toHaveValue("");
  await expect(stateSearch).toBeFocused();
  await stateSearch.fill("000000");
  await results
    .getByRole("button", { name: "Clear state search", exact: true })
    .click();
  await expect(stateSearch).toBeFocused();
  await expect(stateSearch).toHaveValue("");
  await expect(matched).toHaveCount(32);
  await expect(results).toContainText("Showing 1–32 of 64 observed states");
  await results.getByRole("button", { name: "Next", exact: true }).click();
  await expect(results.getByRole("table")).toContainText("111111");
  await page.getByLabel("Search jobs").fill("no-such-job");
  await expect(
    page.getByText("No matching jobs. Try another search or status."),
  ).toBeVisible();
  await expect(results.getByRole("table")).toContainText("111111");
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  const variantRun = await runPython(
    page,
    run.source
      .replace("jobs_many_states.fqx", "jobs_many_states_variant.fqx")
      .replace("seed=42", "seed=43"),
  );
  const variant = await savedRecord(page, variantRun);
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page.getByLabel("Search jobs").fill("");
  await page
    .getByRole("checkbox", { name: `Compare ${record.job.name}`, exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: `Compare ${variant.job.name}`, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  const findings = page.getByRole("region", {
    name: "State differences",
    exact: true,
  });
  await expect(findings).toContainText("Showing 1–32 of 64 compared states");
  const metric = page
    .getByRole("region", { name: "Observed differences", exact: true })
    .locator("p")
    .filter({ hasText: "Observed distribution distance:" });
  const completeMetric = await metric.innerText();
  const comparedViewport = findings.locator(".fq-job-table-scroll");
  await comparedViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await comparedViewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(100);
  await findings
    .getByLabel("Sort compared states", { exact: true })
    .selectOption("state");
  await expect
    .poll(() => comparedViewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  const firstStates = await findings
    .locator("tbody tr td:first-child")
    .allTextContents();
  expect(firstStates[0].trim()).toBe("000000");
  await expect(findings.locator("tbody tr").first()).toContainText(
    `${((count / 4096) * 100).toFixed(1)}%`,
  );
  await comparedViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await findings.getByRole("button", { name: "Next", exact: true }).click();
  await expect
    .poll(() => comparedViewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(
    findings.getByRole("status", { name: "Compared state range", exact: true }),
  ).toContainText("Showing 33–64");
  await expect(findings).toContainText("Showing 33–64 of 64 compared states");
  const secondStates = await findings
    .locator("tbody tr td:first-child")
    .allTextContents();
  expect(secondStates.at(-1).trim()).toBe("111111");
  await expect(findings.locator("tbody")).not.toContainText("-0.0 pp");
  expect(
    new Set([...firstStates, ...secondStates].map((state) => state.trim()))
      .size,
  ).toBe(64);
  await expect(metric).toHaveText(completeMetric);
  await expect(
    findings.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("comparison-pagination.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Swap comparison sides", exact: true })
    .click();
  await expect(findings).toContainText("Showing 1–32 of 64 compared states");
  await expect(
    findings.getByLabel("Sort compared states", { exact: true }),
  ).toHaveValue("change");
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("browser backup failure preserves the last snapshot and exposes recovery without losing the live draft", async ({
  page,
}) => {
  await editor(page).fill("# durable backup\nprint('saved')\n");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).source,
      ),
    )
    .toBe("# durable backup\nprint('saved')\n");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreWorkspaceStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "fq-react-workspace-v1")
        throw new DOMException("Test quota exhausted", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const liveDraft =
    "# newer draft must stay in memory\nprint('not backed up yet')\n";
  await editor(page).fill(liveDraft);
  const notice = page.getByRole("alert", {
    name: "Workspace backup unavailable",
  });
  await expect(notice).toContainText("Browser storage is full");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).source,
    ),
  ).toBe("# durable backup\nprint('saved')\n");
  const downloadPromise = page.waitForEvent("download");
  await notice
    .getByRole("button", { name: "Download workspace backup" })
    .click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe(
    "flagquantum-workspace-backup.json",
  );
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(backup.source).toBe(liveDraft);
  expect(backup.schema).toBe("flagqai.quantum-workspace.v1");
  await expect(editor(page)).toHaveValue(liveDraft);
  await page.evaluate(() => window.__restoreWorkspaceStorage());
  await notice.getByRole("button", { name: "Retry backup" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(editor(page)).toHaveValue(liveDraft);
});

test("interaction craft keeps run feedback honest and preserves the result reading position", async ({
  page,
}, testInfo) => {
  const baseline = await runPython(
    page,
    bell.replace("bell.fqx", "craft_baseline.fqx"),
  );
  const record = await savedRecord(page, baseline);
  const gate = () => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  const submit = gate(),
    stop = gate(),
    history = gate();
  let cancellations = 0;
  const slow = `import time
for i in range(500):
    print(f"line {i}", flush=True)
for i in range(600):
    print(f"tick {i}", flush=True)
    time.sleep(0.1)
`;
  const output = page.getByRole("region", {
    name: "Python output",
    exact: true,
  });
  const status = output.getByRole("status", {
    name: "Python run status",
    exact: true,
  });
  try {
    await page.route("**/api/python/runs", async (route) => {
      if (route.request().method() === "POST") await submit.promise;
      await route.continue();
    });
    await editor(page).fill(slow);
    await page.getByRole("button", { name: "Run Python", exact: true }).click();
    await expect(status).toHaveText("Starting…");
    submit.release();
    await expect(status).toHaveText("Running…");
    const logs = output.getByLabel("Python console output", { exact: true });
    await expect(logs).toContainText("line 499");
    const activeRunId = await page
      .getByLabel("Python run history")
      .inputValue();
    const activeReadPath = "**/api/python/runs/" + activeRunId;
    let readOffline = true,
      statusReads = 0;
    await page.route(activeReadPath, (route) => {
      statusReads++;
      return readOffline
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Acceptance read outage" }),
          })
        : route.continue();
    });
    await expect(status).toHaveText("Reconnecting…");
    await expect(logs).toContainText("line 499");
    await expect(editor(page)).toHaveValue(slow);
    await logs.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const copyOutput = output.getByRole("button", {
      name: "Copy Python output",
      exact: true,
    });
    const copiedText = await logs.textContent();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await copyOutput.click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(copiedText);
    await expect
      .poll(() => logs.evaluate((element) => element.scrollTop))
      .toBe(0);
    await page.evaluate(() => {
      window.originalConsoleCopy = navigator.clipboard.writeText.bind(
        navigator.clipboard,
      );
      navigator.clipboard.writeText = async () => {
        throw new Error("Clipboard denied");
      };
    });
    await copyOutput.click();
    await expect(
      output.getByRole("alert").filter({ hasText: "Cannot copy output" }),
    ).toBeVisible();
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.originalConsoleCopy;
    });
    await copyOutput.click();
    await expect(
      output.getByRole("alert").filter({ hasText: "Cannot copy output" }),
    ).toHaveCount(0);
    await output.screenshot({
      path: testInfo.outputPath("python-reconnecting.png"),
    });
    readOffline = false;
    await expect(status).toHaveText("Running…");
    const rejectedStop = "**/api/python/runs/*/cancel";
    await page.route(rejectedStop, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Acceptance stop rejected" }),
      }),
    );
    await output.getByRole("button", { name: "Stop", exact: true }).click();
    const stopError = output
      .getByRole("alert")
      .filter({ hasText: "Acceptance stop rejected" });
    await expect(stopError).toBeVisible();
    const readsAfterRejection = statusReads;
    await expect
      .poll(() => statusReads)
      .toBeGreaterThan(readsAfterRejection + 1);
    await expect(stopError).toBeVisible();
    await expect(status).toHaveText("Running…");
    await page.unroute(rejectedStop);
    await logs.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const latest = output.getByRole("button", {
      name: "Jump to latest Python output",
      exact: true,
    });
    await expect(latest).toBeEnabled();
    await latest.click();
    await expect(latest).toBeDisabled();
    await expect(logs).toBeFocused();
    await page.route("**/api/python/runs/*/cancel", async (route) => {
      cancellations++;
      await stop.promise;
      await route.continue();
    });
    await output.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(
      output.getByRole("button", { name: "Stopping…", exact: true }),
    ).toBeDisabled();
    await expect(status).toHaveText("Stopping…");
    await expect(stopError).toHaveCount(0);
    await output.screenshot({
      path: testInfo.outputPath("python-stopping.png"),
    });
    await expect.poll(() => cancellations).toBe(1);
    stop.release();
    await expect(status).toHaveText("Stopped");
    await expect(editor(page)).toHaveValue(slow);
    let pendingHistoryRead = 0;
    await page.route("**/api/python/runs/" + baseline.id, async (route) => {
      await history.promise;
      if (pendingHistoryRead < 2) {
        const collecting = pendingHistoryRead++ === 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...baseline,
            status: collecting ? "running" : "completed",
            execution_status: "completed",
            collection_status: collecting ? "collecting" : "pending",
            experiments: [],
            artifact: undefined,
          }),
        });
      }
      await route.continue();
    });
    await page.getByLabel("Python run history").selectOption(baseline.id);
    await expect(status).toHaveText("Loading run…");
    await expect(
      page.getByRole("button", { name: "Run Python", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Python run history")).toHaveValue(
      baseline.id,
    );
    await expect(logs).toContainText("Loading the selected run");
    await expect(copyOutput).toBeDisabled();
    history.release();
    await expect(status).toHaveText("Collecting results…");
    await expect(status).toHaveText("Completed");
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await page
      .getByRole("button", { name: `Open job ${record.job.name}`, exact: true })
      .click();
    const results = page.getByRole("region", {
      name: "Job results",
      exact: true,
    });
    await results.getByRole("button", { name: "Table", exact: true }).click();
    await results.getByRole("button", { name: "Counts", exact: true }).click();
    await results.getByLabel("Sort measurement states").selectOption("state");
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor(page)).toHaveValue(slow);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await expect(
      results.getByRole("button", { name: "Table", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      results.getByRole("button", { name: "Counts", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(
      results.getByRole("button", { name: "Table", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(results.getByLabel("Sort measurement states")).toHaveValue(
      "state",
    );
    await page.screenshot({
      path: testInfo.outputPath("interaction-craft.png"),
      fullPage: true,
    });
    const exports = results.getByRole("button", {
      name: "Export results",
      exact: true,
    });
    await exports.click();
    await expect(
      results.getByRole("button", { name: "JSON", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(exports).toHaveAttribute("aria-expanded", "false");
    await expect(exports).toBeFocused();
    await exports.click();
    await results
      .getByRole("heading", { name: record.job.name, exact: true })
      .click();
    await expect(exports).toHaveAttribute("aria-expanded", "false");
    const download = page.waitForEvent("download");
    await exports.click();
    await results.getByRole("button", { name: "JSON", exact: true }).click();
    const file = await download;
    const { readFile } = await import("node:fs/promises");
    expect(JSON.parse(await readFile(await file.path(), "utf8")).id).toBe(
      record.job.id,
    );
    await expect(exports).toHaveAttribute("aria-expanded", "false");
  } finally {
    submit.release();
    stop.release();
    history.release();
  }
});

test("model import explains invalid files and preserves the newest draft during file reads", async ({
  page,
}, testInfo) => {
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) === "true")
    await agent.click();
  const examples = page.getByRole("region", {
    name: "Example models",
    exact: true,
  });
  expect((await examples.boundingBox()).height).toBeLessThan(260);
  await page.screenshot({
    path: testInfo.outputPath("compact-model-library.png"),
    fullPage: true,
  });
  const sidebarResize = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  for (let step = 0; step < 3; step++)
    await sidebarResize.press("Shift+ArrowLeft");
  await expect(sidebarResize).toHaveAttribute("aria-valuenow", "170");
  const library = page.locator(".fq-model-library");
  expect(
    await library.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".fq-model-library-tabs")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await expect(examples.getByRole("button").last()).toContainText(
    "Quantum Arithmetic",
  );
  await page.screenshot({
    path: testInfo.outputPath("compact-model-library-narrow.png"),
    fullPage: true,
  });
  await sidebarResize.dblclick();
  await editor(page).fill(draft);
  const upload = page.locator('.fq-library-body input[type="file"]').first();
  const modelSearch = page.getByRole("textbox", {
    name: "Search models",
    exact: true,
  });
  await modelSearch.fill("   ghz   ");
  await expect(
    page.locator(".fq-library-card").filter({ hasText: "GHZ State" }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".fq-library-card").filter({ hasText: "Bell State" }),
  ).toHaveCount(0);
  await modelSearch.fill("no-model-with-this-name");
  await expect(
    page.getByRole("status").filter({ hasText: "No models match your search" }),
  ).toBeVisible();
  await modelSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(modelSearch).toHaveValue("no-model-with-this-name");
  await page.screenshot({
    path: testInfo.outputPath("model-search-empty.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clear model search", exact: true })
    .click();
  await expect(modelSearch).toHaveValue("");
  await expect(modelSearch).toBeFocused();
  await modelSearch.fill("ghz");
  await modelSearch.press("Escape");
  await expect(modelSearch).toHaveValue("");
  await expect(editor(page)).toHaveValue(draft);
  await page.getByRole("button", { name: "TEMPLATES", exact: true }).click();
  const description = page.getByRole("textbox", {
    name: "Template description",
    exact: true,
  });
  const generate = page.getByRole("button", {
    name: "Generate model →",
    exact: true,
  });
  await expect(generate).toBeDisabled();
  await description.fill("Bell pair");
  await generate.click();
  const applyTemplate = page.getByRole("button", {
    name: "Apply model →",
    exact: true,
  });
  await expect(applyTemplate).toBeVisible();
  await expect(
    page
      .locator(".fq-library-body .fq-code-example .fq-syntax-keyword")
      .first(),
  ).toHaveText("import");
  await description.fill("unsupported quantum task");
  await expect(applyTemplate).toHaveCount(0);
  await expect(page.locator(".fq-library-body .fq-code-example")).toHaveCount(
    0,
  );
  await generate.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No matching local template" }),
  ).toBeVisible();
  await description.fill("GHZ state");
  await expect(
    page.getByRole("alert").filter({ hasText: "No matching local template" }),
  ).toHaveCount(0);
  await generate.click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const templateCode = await page
    .locator(".fq-library-body .fq-code-example pre")
    .textContent();
  await page
    .getByRole("button", { name: "Copy GHZ State", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(templateCode);
  await page.screenshot({
    path: testInfo.outputPath("template-preview.png"),
    fullPage: true,
  });
  await expect(editor(page)).toHaveValue(draft);
  await page.getByRole("button", { name: "MODELS", exact: true }).click();
  for (const [name, buffer, message] of [
    ["empty.py", Buffer.alloc(0), "This file is empty"],
    [
      "large.py",
      Buffer.alloc(32769, 32),
      "Source files must be no larger than 32 KiB",
    ],
    ["unsupported.bin", Buffer.from("data"), "Choose a Python"],
    ["encoding.py", Buffer.from([255, 254]), "not valid UTF-8"],
  ]) {
    await upload.setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer,
    });
    const error = page.getByRole("alert").filter({ hasText: message });
    await expect(error).toHaveCount(1);
    await expect(error).toBeVisible();
    await expect(editor(page)).toHaveValue(draft);
  }
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name === "unreadable.py")
        return Promise.reject(Error("Acceptance read error"));
      if (this.name === "upload.PY")
        return new Promise((resolve, reject) => {
          globalThis.__releaseSourceImport = () =>
            read.call(this).then(resolve, reject);
        });
      return read.call(this);
    };
  });
  await upload.setInputFiles({
    name: "unreadable.py",
    mimeType: "text/plain",
    buffer: Buffer.from("print(1)"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Could not read this file",
  );
  await page
    .getByRole("button", { name: "Dismiss import error", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const imported = "import flagquantum as fq\n\nprint('imported')\n";
  await upload.setInputFiles({
    name: "upload.PY",
    mimeType: "text/plain",
    buffer: Buffer.from(imported),
  });
  await expect(
    page.getByRole("button", { name: "Importing file…", exact: true }),
  ).toBeDisabled();
  const newerDraft = draft + "# edited while the file was being read\n";
  await editor(page).fill(newerDraft);
  await page.evaluate(() => globalThis.__releaseSourceImport());
  await expect(editor(page)).toHaveValue(imported);
  await expect(
    page.getByRole("button", { name: "Python", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Draft · / })
    .first()
    .click();
  await expect(editor(page)).toHaveValue(newerDraft);
  await page.reload();
  await expect(editor(page)).toHaveValue(newerDraft);
  await page.screenshot({
    path: testInfo.outputPath("import-draft-retained.png"),
    fullPage: true,
  });
});

test("parameterized Bell keeps angle, source, circuit and changed results linked after refresh", async ({
  page,
}, testInfo) => {
  const records = [];
  for (const [angle, filename, states] of [
    ["0", "bell_theta_zero.fqx", ["00", "11"]],
    ["pi", "bell_theta_pi.fqx", ["01", "10"]],
  ]) {
    const source = `from math import pi
import flagquantum as fq

theta = ${angle}
circuit = fq.Circuit(2).h(0).cx(0, 1).ry(1, theta)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=256, seed=42))
fq.save("${filename}", result.plan, result=result)
`;
    const run = await runPython(page, source);
    expect(run.status, JSON.stringify(run)).toBe("completed");
    const record = await savedRecord(page, run, filename);
    expect(Object.keys(record.job.result.counts).sort()).toEqual(states);
    const rotation = record.program.compiled.instructions.find(
      (g) => g.name.toLowerCase() === "ry",
    );
    if (angle === "0") {
      // The actual compiler removes an identity rotation; do not invent a gate.
      expect(rotation).toBeUndefined();
    } else {
      expect(rotation).toBeTruthy();
      expect(rotation.wires).toEqual([1]);
      expect(Number(rotation.params.theta)).toBeCloseTo(Math.PI, 5);
    }
    await openCircuit(page, run, filename);
    await expect(
      page.getByRole("group", {
        name: "Interactive hierarchical quantum circuit",
      }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/#program$/);
    await openProgramMetadata(page);
    await expect(
      page.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", `/api/experiments/${record.id}/file`);
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor(page)).toHaveValue(source);
    records.push(record);
  }
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  for (const record of records)
    await page
      .getByRole("checkbox", {
        name: `Compare ${record.job.name}`,
        exact: true,
      })
      .check();
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(comparison).toContainText("1 added · 0 removed operations");
  await expect(comparison).toContainText("100.0%");
  await page.reload();
  await expect(comparison).toContainText("1 added · 0 removed operations");
  await expect(comparison).toContainText("100.0%");
  await page.screenshot({
    path: testInfo.outputPath("parameterized-bell-comparison.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("circuit fit includes tall wires and zoom keeps the current viewport centered", async ({
  page,
}, testInfo) => {
  const run = await runPython(
    page,
    `import flagquantum as fq
circuit = fq.Circuit(8)
for q in range(8):
    circuit.h(q)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
fq.save("viewport.fqx", result.plan, result=result)
`,
  );
  await editor(page).fill(draft);
  await openCircuit(page, run);
  const canvas = page.locator(".fq-circuit-canvas");
  const zoom = page.getByRole("status", { name: "Circuit zoom", exact: true });
  const detail = page.getByRole("combobox", {
    name: "Circuit detail",
    exact: true,
  });
  const wireDisplay = page.getByRole("combobox", {
    name: "Circuit wire display",
    exact: true,
  });
  const chromeHeight = await page
    .locator(".fq-visualizer")
    .evaluate((element) => {
      const canvas = element.querySelector(".fq-circuit-workarea");
      return (
        canvas.getBoundingClientRect().top - element.getBoundingClientRect().top
      );
    });
  expect(chromeHeight).toBeLessThan(125);
  for (const level of ["1", "3", "100", "0"]) {
    await detail.selectOption(level);
    await expect(detail).toHaveValue(level);
  }
  await page.getByRole("button", { name: "Compiled", exact: true }).click();
  await expect(detail).toHaveValue("custom");
  await page.getByRole("button", { name: "Logical", exact: true }).click();
  await detail.selectOption("100");
  await wireDisplay.selectOption("registers");
  await expect(wireDisplay).toHaveValue("registers");
  await wireDisplay.selectOption("qubits");
  const resizeInfo = page.getByRole("separator", {
    name: "Resize program information",
    exact: true,
  });
  await resizeInfo.press("ArrowLeft");
  await expect(resizeInfo).toHaveAttribute("aria-valuenow", "312");
  await expect
    .poll(async () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("fq-pane-layout-v1")).programInfo,
      ),
    )
    .toBe(312);
  await resizeInfo.dblclick();
  await expect(resizeInfo).toHaveAttribute("aria-valuenow", "300");
  const handle = await resizeInfo.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 24, handle.y + 50);
  await page.mouse.up();
  await expect(resizeInfo).toHaveAttribute("aria-valuenow", "324");
  const focusCircuit = page.getByRole("button", {
    name: "Focus quantum circuit",
    exact: true,
  });
  await focusCircuit.click();
  await expect(page.locator(".fq-program-info")).toBeHidden();
  await expect(focusCircuit).toHaveAttribute("aria-pressed", "true");
  await focusCircuit.click();
  await expect(resizeInfo).toHaveAttribute("aria-valuenow", "324");
  await resizeInfo.dblclick();
  await page.screenshot({
    path: testInfo.outputPath("compact-circuit-toolbar.png"),
    fullPage: true,
  });
  for (
    let step = 0;
    step < 18 && parseInt(await zoom.innerText()) < 150;
    step++
  )
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await canvas.evaluate((element) => {
    element.scrollLeft = 250;
    element.scrollTop = 150;
  });
  const center = async () =>
    canvas.evaluate(
      (element, zoom) => {
        const style = getComputedStyle(element);
        return {
          x:
            ((element.scrollLeft +
              element.clientWidth / 2 -
              parseFloat(style.paddingLeft)) *
              90) /
            zoom,
          y:
            ((element.scrollTop +
              element.clientHeight / 2 -
              parseFloat(style.paddingTop)) *
              90) /
            zoom,
          left: element.scrollLeft,
          top: element.scrollTop,
        };
      },
      parseInt(await zoom.innerText()),
    );
  const before = await center();
  expect(before.left).toBeGreaterThan(0);
  expect(before.top).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const after = await center();
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  for (
    let step = 0;
    step < 18 && parseInt(await zoom.innerText()) < 180;
    step++
  )
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
  // A short viewport makes height, rather than width, constrain the fit.
  await page.setViewportSize({ width: 1440, height: 560 });
  expect(
    await canvas.evaluate((element) => {
      const view = element.querySelector("svg").viewBox.baseVal;
      return (
        element.clientHeight / view.height < element.clientWidth / view.width
      );
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          element.scrollLeft === 0 &&
          element.scrollTop === 0,
      ),
    )
    .toBe(true);
  const fitted = await zoom.innerText();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(zoom).toHaveText(fitted);
  const fitButton = page.getByRole("button", { name: "Fit", exact: true });
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  const fits = () =>
    canvas.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth + 1 &&
        element.scrollHeight <= element.clientHeight + 1,
    );
  await page.setViewportSize({ width: 1200, height: 480 });
  await expect.poll(fits).toBe(true);
  for (const selector of [".fq-circuit-header", ".fq-circuit-toolbar"]) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("compact-circuit-toolbar-narrow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await expect.poll(fits).toBe(true);
  await page
    .getByRole("combobox", { name: "Circuit detail", exact: true })
    .selectOption("100");
  await expect.poll(fits).toBe(true);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "false");
  const manualZoom = await zoom.innerText();
  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(zoom).toHaveText(manualZoom);
  await fitButton.click();
  await expect.poll(fits).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("circuit-fit.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse program information", exact: true })
    .click();
  const gates = canvas.getByRole("button", { name: /^Inspect H gate / });
  await gates.first().click();
  await expect(page.locator(".fq-program-info")).toBeVisible();
  await expect(gates.first()).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.locator('[data-circuit-selection="gate"]')).toHaveCount(
    1,
  );
  await gates.nth(1).focus();
  await gates.nth(1).press("Enter");
  await expect(gates.first()).toHaveAttribute("aria-pressed", "false");
  await expect(gates.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fq-node-details")).toContainText("Qubits: 1");
  await page.screenshot({
    path: testInfo.outputPath("selected-gate.png"),
    fullPage: true,
  });
  const measurement = canvas.getByRole("button", {
    name: "Measure q0",
    exact: true,
  });
  await measurement.focus();
  await measurement.press("Space");
  await expect(measurement).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.locator('[data-circuit-selection="gate"]')).toHaveCount(
    0,
  );
  await expect(page.locator(".fq-node-details")).toContainText(
    "Measurement · q0",
  );
  await page
    .getByRole("combobox", { name: "Circuit detail", exact: true })
    .selectOption("0");
  await expect(measurement).toHaveAttribute("aria-pressed", "false");
  const module = canvas.getByRole("button", {
    name: "Select ungrouped",
    exact: true,
  });
  await module.focus();
  await module.press("Enter");
  await expect(module).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fq-node-details h3")).toHaveText("ungrouped");
  await canvas
    .getByRole("button", { name: "Expand ungrouped", exact: true })
    .click();
  await expect(page.locator(".fq-node-details")).toContainText(
    "Expand a module",
  );
  const pythonSnapshot = page.getByRole("button", {
    name: "View Python snapshot ↗",
    exact: true,
  });
  await pythonSnapshot.click();
  const snapshot = page.getByRole("dialog", {
    name: "Circuit source snapshot",
    exact: true,
  });
  await expect(snapshot).toBeVisible();
  await expect(snapshot.locator(".fq-code-numbered")).toBeVisible();
  await expect(snapshot.locator(".fq-syntax-keyword").first()).toHaveText(
    "import",
  );
  await expect(snapshot.locator("[data-highlighted]")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("python-source-preview.png"),
    fullPage: true,
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await snapshot
    .getByRole("button", { name: "Copy Original Python source", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(run.source);
  await page.keyboard.press("Escape");
  await expect(snapshot).toHaveCount(0);
  await expect(pythonSnapshot).toBeFocused();
  const record = await savedRecord(page, run, "viewport.fqx");
  await page
    .getByRole("button", { name: "View OpenQASM snapshot ↗", exact: true })
    .click();
  await expect(snapshot).toBeVisible();
  await snapshot
    .getByRole("button", { name: "Copy OpenQASM circuit export", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(record.program.source);
  await page.mouse.click(5, 5);
  await expect(snapshot).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gate reference", exact: true })
    .click();
  const reference = page.getByRole("dialog", {
    name: "Gate reference",
    exact: true,
  });
  const gateButtons = reference
    .getByRole("navigation", { name: "Supported gates", exact: true })
    .getByRole("button");
  await gateButtons.first().focus();
  await gateButtons.first().press("ArrowDown");
  await expect(gateButtons.nth(1)).toBeFocused();
  await expect(gateButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(reference.locator("article h2")).toContainText("Identity alias");
  await gateButtons.nth(1).press("End");
  await expect(gateButtons.last()).toBeFocused();
  await expect(gateButtons.last()).toHaveAttribute("aria-pressed", "true");
  await gateButtons.last().press("ArrowDown");
  await expect(gateButtons.first()).toBeFocused();
  await gateButtons.first().press("ArrowUp");
  await expect(gateButtons.last()).toBeFocused();
  await gateButtons.last().press("Home");
  await expect(gateButtons.first()).toHaveAttribute("aria-pressed", "true");
  const runExample = reference.getByRole("button", {
    name: "Run example",
    exact: true,
  });
  await runExample.click();
  const exampleResult = reference.getByRole("region", {
    name: "Precomputed FlagQuantum example result",
    exact: true,
  });
  await expect(exampleResult).toBeVisible();
  await expect(runExample).toHaveAttribute("aria-expanded", "true");
  const hideExample = exampleResult.getByRole("button", {
    name: "Hide example result",
    exact: true,
  });
  await expect(hideExample.locator("svg")).toHaveCount(1);
  await hideExample.focus();
  await hideExample.press("Enter");
  await expect(exampleResult).toHaveCount(0);
  await expect(runExample).toHaveAttribute("aria-expanded", "false");
  await expect(runExample).toBeFocused();
  expect(
    await runExample.evaluate((element) => {
      const article = element.closest("article").getBoundingClientRect();
      const button = element.getBoundingClientRect();
      return button.top >= article.top && button.bottom <= article.bottom;
    }),
  ).toBe(true);
  await runExample.press("Enter");
  await expect(exampleResult).toBeVisible();
  await hideExample.click();
  await expect(runExample).toBeFocused();
  const exampleCopy = reference.getByRole("button", {
    name: "Copy OpenQASM example",
    exact: true,
  });
  const qasmExample = reference.locator(".fq-code-example").filter({
    has: page.getByRole("heading", {
      name: "OpenQASM example",
      exact: true,
    }),
  });
  await exampleCopy.click();
  await expect(exampleCopy).toHaveAttribute("title", "Copied to clipboard");
  await gateButtons.nth(1).click();
  await expect(exampleCopy).toHaveAttribute("title", "Copy OpenQASM example");
  const copiedSource = await qasmExample.locator("pre").innerText();
  await page.evaluate(() => {
    window.originalExampleCopy = navigator.clipboard.writeText.bind(
      navigator.clipboard,
    );
    window.exampleCopyCalls = 0;
    const pending = new Promise((resolve) => {
      window.releaseExampleCopy = resolve;
    });
    navigator.clipboard.writeText = async (text) => {
      window.exampleCopyCalls++;
      await pending;
      await window.originalExampleCopy(text);
    };
  });
  try {
    await exampleCopy.click();
    await expect(exampleCopy).toBeDisabled();
    await expect(exampleCopy).toHaveAttribute("title", "Copying…");
    await exampleCopy.evaluate((element) => element.click());
    expect(await page.evaluate(() => window.exampleCopyCalls)).toBe(1);
    await gateButtons.nth(2).click();
    await page.evaluate(() => window.releaseExampleCopy());
    await expect(exampleCopy).toBeEnabled();
    await expect(exampleCopy).toHaveAttribute("title", "Copy OpenQASM example");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(copiedSource);
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw Error("Clipboard denied");
      };
    });
    await exampleCopy.click();
    await expect(qasmExample.getByRole("status")).toContainText(
      "Copy unavailable",
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.originalExampleCopy;
    });
    await exampleCopy.click();
    await expect(exampleCopy).toHaveAttribute("title", "Copied to clipboard");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(await qasmExample.locator("pre").innerText());
  } finally {
    await page.evaluate(() => {
      window.releaseExampleCopy();
      navigator.clipboard.writeText = window.originalExampleCopy;
    });
  }
  const gateSearch = reference.getByRole("textbox", {
    name: "Search gates",
    exact: true,
  });
  const category = reference.getByRole("combobox", {
    name: "Gate category",
    exact: true,
  });
  await category.selectOption("Rotation");
  await gateSearch.fill("  RX  ");
  await expect(
    reference.getByRole("status", { name: "Gate search results", exact: true }),
  ).toHaveText("2 results");
  await gateSearch.press("ArrowDown");
  await expect(gateButtons.first()).toBeFocused();
  await expect(reference.locator("article h2")).toContainText("RX");
  await gateSearch.focus();
  const gateEscapeAllowed = await gateSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(gateEscapeAllowed).toBe(false);
  await expect(gateSearch).toHaveValue("  RX  ");
  await gateSearch.press("Escape");
  await expect(gateSearch).toHaveValue("");
  await expect(category).toHaveValue("Rotation");
  await expect(reference).toBeVisible();
  await gateSearch.press("ArrowUp");
  await expect(gateButtons.last()).toBeFocused();
  await gateSearch.fill("rz");
  await page.screenshot({
    path: testInfo.outputPath("gate-search-controls.png"),
    fullPage: true,
  });
  await reference
    .getByRole("button", { name: "Clear gate search", exact: true })
    .click();
  await expect(gateSearch).toBeFocused();
  await expect(gateSearch).toHaveValue("");
  await expect(category).toHaveValue("Rotation");
  await gateSearch.fill("no-matching-gate");
  await gateSearch.press("ArrowDown");
  await expect(gateSearch).toBeFocused();
  await expect(
    reference.getByRole("heading", { name: "No matching gates", exact: true }),
  ).toBeVisible();
  await reference
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(gateSearch).toHaveValue("");
  await expect(category).toHaveValue("All");
  await expect(gateSearch).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reference).toHaveCount(0);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("backup draft recovery previews and merges code without replacing live work", async ({
  page,
}, testInfo) => {
  const original = "# Exported unsaved work\nprint('saved backup')\n";
  await editor(page).fill(original);
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Workspace backups",
    exact: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download workspace backup", exact: true })
    .click();
  const downloaded = await downloadEvent;
  const data = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(data.source).toBe(original);
  await dialog
    .getByRole("button", { name: "Close workspace backups", exact: true })
    .click();
  await editor(page).fill(draft);
  const beforeRuns = (await get(page, "/api/python/runs")).length;
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const file = dialog.getByLabel("Choose workspace backup", { exact: true });
  await file.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "not valid backup JSON",
  );
  const choose = async (value) =>
    file.setInputFiles({
      name: "workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  data.editorLink = {
    incoming: { source: "# incoming Agent proposal\n" },
    id: "untrusted-file-link",
  };
  await choose(data);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText(
    "2 new models selected",
  );
  await dialog
    .getByRole("button", { name: "Preview backup draft 1", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Backup draft preview code", { exact: true }),
  ).toHaveText(original.trimEnd());
  await page.screenshot({
    path: testInfo.outputPath("backup-preview.png"),
    fullPage: true,
  });
  const recover = dialog.getByRole("button", {
    name: "Recover selected drafts",
    exact: true,
  });
  const choices = dialog.getByRole("checkbox");
  await choices.nth(1).uncheck();
  await expect(dialog.getByRole("status").first()).toContainText(
    "1 new model selected",
  );
  await choices.nth(1).check();
  await recover.click();
  await expect(dialog.getByRole("status")).toContainText("2 drafts recovered");
  await choose(data);
  await expect(recover).toBeDisabled();
  data.source = "# Alternate restored draft\n";
  await choose(data);
  await expect(dialog.getByRole("status")).toContainText(
    "1 new model selected",
  );
  await recover.click();
  await dialog
    .getByRole("button", { name: "Close workspace backups", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  await page.reload();
  await expect(editor(page)).toHaveValue(draft);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fq-react-workspace-v1")),
  );
  expect(stored.models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: original }),
      expect.objectContaining({ source: "# incoming Agent proposal\n" }),
      expect.objectContaining({
        name: data.name + " · Restored 1",
        source: data.source,
      }),
    ]),
  );
  expect(
    stored.models.every((model) => !model.editorLink && !model.project),
  ).toBe(true);
  expect((await get(page, "/api/python/runs")).length).toBe(beforeRuns);
});

test("compact editor output preserves manual heights and keeps file actions available", async ({
  page,
}, testInfo) => {
  await page.evaluate(() =>
    localStorage.setItem("fq-pane-layout-v1", JSON.stringify({ errors: 328 })),
  );
  await page.reload();
  const resize = page.getByRole("separator", {
    name: "Resize model errors panel",
    exact: true,
  });
  await expect(resize).toHaveAttribute("aria-valuenow", "328");
  const toolbar = page.locator(".fq-model-toolbar");
  await expect(toolbar.locator(".fq-editor-sync")).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Save", exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Share with Agent", exact: true }),
  ).toBeVisible();
  await runPython(page, bell);
  const fullHeight = await editor(page).evaluate(
    (element) => element.clientHeight,
  );
  await page
    .getByRole("button", { name: "Compact Python output", exact: true })
    .click();
  await expect(resize).toHaveAttribute("aria-valuenow", "112");
  await expect(
    page
      .getByRole("region", { name: "Python output", exact: true })
      .locator(".fq-python-logs"),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "View circuit ↗", exact: true }),
  ).toBeVisible();
  expect(
    await editor(page).evaluate((element) => element.clientHeight),
  ).toBeGreaterThan(fullHeight + 150);
  await page.screenshot({
    path: testInfo.outputPath("compact-output.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(resize).toHaveAttribute("aria-valuenow", "112");
  await page
    .getByRole("button", { name: "Expand Python output", exact: true })
    .click();
  await expect(resize).toHaveAttribute("aria-valuenow", "328");
  await page
    .getByRole("button", { name: "Compact Python output", exact: true })
    .click();
  await resize.focus();
  await resize.press("ArrowUp");
  await expect(resize).toHaveAttribute("aria-valuenow", "124");
  await expect(
    page.getByRole("button", { name: "Compact Python output", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(resize).toHaveAttribute("aria-valuenow", "124");
  await page
    .getByRole("button", { name: "Compact Python output", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Python output", exact: true })
    .click();
  await expect(resize).toHaveAttribute("aria-valuenow", "124");
  const handle = await resize.boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2 - 80,
  );
  await page.mouse.up();
  await expect(resize).toHaveAttribute("aria-valuenow", "204");
  await page.reload();
  await expect(resize).toHaveAttribute("aria-valuenow", "204");
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(
    await toolbar.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await expect(
    toolbar.getByRole("button", { name: "Save", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Compact Python output", exact: true })
    .click();
  await editor(page).fill(
    "import time\nprint('running', flush=True)\ntime.sleep(30)\n",
  );
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();
  await expect(resize).toHaveAttribute("aria-valuenow", "112");
  await stop.click();
  await expect(
    page.getByRole("status", { name: "Python run status", exact: true }),
  ).toContainText("Stopped");
});

test("Execution separates common settings from advanced options without losing snapshots or manual layout", async ({
  page,
}, testInfo) => {
  const run = await runPython(page, bell);
  const record = await savedRecord(page, run);
  await editor(page).fill(draft);
  await openCircuit(page, run);
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  const execution = page.getByRole("region", {
    name: "Execution configuration",
    exact: true,
  });
  const settings = execution.getByRole("region", {
    name: "Run settings",
    exact: true,
  });
  const advanced = execution.locator(".fq-execution-advanced");
  const runtime = page
    .getByRole("region", { name: "Compute backend", exact: true })
    .locator("details");
  const shots = execution.getByRole("spinbutton", {
    name: "Num Shots",
    exact: true,
  });
  const seed = execution.getByRole("spinbutton", {
    name: "Random Seed",
    exact: true,
  });
  const name = execution.getByRole("textbox", {
    name: "Job Name",
    exact: true,
  });
  const submit = execution.getByRole("button", { name: "Run", exact: true });
  await expect(advanced).not.toHaveAttribute("open");
  await expect(runtime).not.toHaveAttribute("open");
  await expect(seed).toBeHidden();
  await expect(
    execution.getByRole("region", { name: "Execution source", exact: true }),
  ).toContainText("Your Model draft is unchanged");
  expect((await settings.boundingBox()).height).toBeLessThan(170);
  await shots.fill("64");
  await name.fill("compact-execution-validation");
  await advanced.locator("summary").click();
  await seed.fill("-1");
  await expect(submit).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await seed.fill("7");
  await expect(submit).toBeEnabled();
  await advanced.locator("summary").click();
  await expect(advanced.locator("summary")).toContainText("Seed 7");
  await page.reload();
  await expect(shots).toHaveValue("64");
  await expect(name).toHaveValue("compact-execution-validation");
  await expect(seed).toBeHidden();
  await advanced.locator("summary").click();
  await expect(seed).toHaveValue("7");
  await page.reload();
  await expect(seed).toBeVisible();
  await advanced.locator("summary").click();
  await runtime.locator("summary").click();
  await expect(runtime).toContainText("CPU threads / task");
  await runtime.locator("summary").click();
  const sidebar = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  const handle = await sidebar.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + 50);
  await page.mouse.up();
  await expect(sidebar).toHaveAttribute("aria-valuenow", "320");
  await page.reload();
  await expect(sidebar).toHaveAttribute("aria-valuenow", "320");
  await page.screenshot({
    path: testInfo.outputPath("compact-execution.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 700 });
  expect(
    await execution.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await expect(shots).toBeVisible();
  await expect(name).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("compact-execution-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Execution targets are intentionally transient; explicitly choose the archived
  // circuit again after refresh before checking submission of that snapshot.
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/jobs",
  );
  await submit.click();
  const payload = (await request).postDataJSON();
  expect(payload).toMatchObject({
    shots: 64,
    seed: 7,
    name: "compact-execution-validation",
    source: record.program.source,
  });
  await expect(page).toHaveURL(/#jobs$/);
  await expect
    .poll(
      async () => {
        const job = (await get(page, "/api/jobs")).find(
          (job) => job.name === "compact-execution-validation",
        );
        return job?.status;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
  const job = (await get(page, "/api/jobs")).find(
    (job) => job.name === "compact-execution-validation",
  );
  expect(
    Object.values(job.result.counts).reduce((sum, count) => sum + count, 0),
  ).toBe(64);
  expect(Object.keys(job.result.counts).sort()).toEqual(["00", "11"]);
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await execution
    .getByRole("button", {
      name: "Use current Model draft instead",
      exact: true,
    })
    .click();
  await expect(
    execution.getByRole("region", { name: "Execution source", exact: true }),
  ).toHaveCount(0);
  await expect(execution.locator(".fq-execution-identity")).toContainText(
    "Model draft",
  );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("Synthesis shows source-bound compilation status and reusable results without replacing drafts", async ({
  page,
}, testInfo) => {
  const pythonDraft = await editor(page).inputValue();
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  const synthesis = page.getByRole("region", {
    name: "Synthesis workspace",
    exact: true,
  });
  const status = synthesis.getByRole("status", {
    name: "Compilation status",
    exact: true,
  });
  await expect(status).toHaveText("Python runs in Model");
  await synthesis
    .getByRole("button", { name: "Open Python in Model", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(pythonDraft);
  await page.getByRole("button", { name: "OpenQASM", exact: true }).click();
  const source =
    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n// Source-bound synthesis acceptance\nh q[0];\ncx q[0],q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];\n';
  await editor(page).fill(source);
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await expect(status).toHaveText("Ready to compile");
  const compile = synthesis.getByRole("button", {
    name: "Compile model →",
    exact: true,
  });
  let release;
  let hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/compile", async (route) => {
    await hold;
    await route.continue();
  });
  const compiledResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/compile",
  );
  try {
    await compile.click();
    await expect(status).toHaveText("Compiling…");
    await expect(
      synthesis.getByRole("button", { name: "Compiling…", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath("compact-synthesis-working.png"),
      fullPage: true,
    });
  } finally {
    release();
  }
  const response = await compiledResponse;
  expect(response.ok(), JSON.stringify(await response.json())).toBe(true);
  await expect(page).toHaveURL(/#program$/, { timeout: 90000 });
  await expect(
    page.getByRole("group", {
      name: "Interactive hierarchical quantum circuit",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await expect(status).toHaveText("Compiled");
  const result = synthesis.getByRole("region", {
    name: "Compilation result",
    exact: true,
  });
  await expect(result.locator(".fq-synthesis-metrics")).toContainText(
    "Qubits2",
  );
  await expect(result.locator(".fq-synthesis-metrics")).toContainText("Gates2");
  expect(
    (await result.boundingBox()).y - (await synthesis.boundingBox()).y,
  ).toBeLessThan(150);
  const sidebar = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  const handle = await sidebar.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + 50);
  await page.mouse.up();
  await expect(sidebar).toHaveAttribute("aria-valuenow", "320");
  await page.reload();
  await expect(sidebar).toHaveAttribute("aria-valuenow", "320");
  await expect(status).toHaveText("Compiled");
  await page.screenshot({
    path: testInfo.outputPath("compact-synthesis-result.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 700 });
  expect(
    await synthesis.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("compact-synthesis-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await result
    .getByRole("button", { name: "Open circuit", exact: true })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await synthesis
    .getByRole("button", { name: "Edit model", exact: true })
    .click();
  const changed = source.replace("measure q[0]", "x q[1];\nmeasure q[0]");
  await editor(page).fill(changed);
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await expect(status).toHaveText("Ready to compile");
  await expect(
    synthesis.getByRole("region", {
      name: "Previous compilation",
      exact: true,
    }),
  ).toContainText("Source differs from the current model");
  hold = new Promise((resolve) => {
    release = resolve;
  });
  const newer = changed + "// Keep this newer draft\n";
  try {
    await compile.click();
    await expect(status).toHaveText("Compiling…");
    await synthesis
      .getByRole("button", { name: "Edit model", exact: true })
      .click();
    await editor(page).fill(newer);
    await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
    await expect(status).toHaveText("Compiling another source…");
  } finally {
    release();
  }
  await expect(status).toHaveText("Ready to compile", { timeout: 90000 });
  await expect(page).toHaveURL(/#synthesis$/);
  await expect(
    synthesis
      .getByRole("region", { name: "Previous compilation", exact: true })
      .locator(".fq-synthesis-metrics"),
  ).toContainText("Gates3");
  await synthesis
    .getByRole("button", { name: "Edit model", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(newer);
  await editor(page).fill(source.replace("h q[0]", "h q[7]"));
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await compile.click();
  await expect(status).toHaveText("Compilation failed", { timeout: 90000 });
  await expect(synthesis.getByRole("alert")).toBeVisible();
  await expect(compile).toBeEnabled();
});

test("Quantum compact list preserves explicit information-panel choices and manual sizes", async ({
  page,
}, testInfo) => {
  const first = await runPython(
    page,
    bell.replace("bell.fqx", "quantum_reference.fqx"),
  );
  const second = await runPython(
    page,
    bell
      .replace("bell.fqx", "quantum_variant_with_a_long_descriptive_name.fqx")
      .replace("result = fq.run", "circuit.x(1)\nresult = fq.run"),
  );
  const a = await savedRecord(page, first),
    b = await savedRecord(page, second);
  await editor(page).fill(draft);
  await openCircuit(page, second);
  const library = page.getByRole("list", {
    name: "Quantum programs",
    exact: true,
  });
  const reference = library.getByRole("button", {
    name: `Open quantum program ${a.program.name}`,
    exact: true,
  });
  const variant = library.getByRole("button", {
    name: `Open quantum program ${b.program.name}`,
    exact: true,
  });
  const panel = page.locator(".fq-program-info");
  const info = page.getByRole("button", { name: "Info", exact: true });
  const resize = page.getByRole("separator", {
    name: "Resize program information",
    exact: true,
  });
  const summaryResize = page.getByRole("separator", {
    name: "Resize program summary and node details",
    exact: true,
  });
  await expect(variant).toHaveAttribute("aria-current", "true");
  expect((await variant.boundingBox()).height).toBeLessThanOrEqual(60);
  await expect(variant).toContainText("Saved result");
  await expect(variant).toHaveAttribute("title", new RegExp(b.program.name));
  await expect(variant.locator("time")).toHaveAttribute("title", /.+/);
  expect(
    (await panel.locator(".fq-metrics").boundingBox()).y -
      (await panel.boundingBox()).y,
  ).toBeLessThan(120);
  const metadata = panel.locator(".fq-program-metadata");
  await expect(metadata).not.toHaveAttribute("open");
  await expect(
    panel.getByRole("button", { name: "View saved result →" }),
  ).toBeVisible();
  await metadata.locator(":scope > summary").click();
  expect((await panel.locator(".fq-metrics").boundingBox()).y).toBeLessThan(
    (await panel.locator(".fq-experiment-banner").boundingBox()).y,
  );
  await expect(
    panel.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toBeVisible();
  await metadata.locator(":scope > summary").click();
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 36, handle.y + 50);
  await page.mouse.up();
  await expect(resize).toHaveAttribute("aria-valuenow", "336");
  const summaryHandle = await summaryResize.boundingBox();
  await page.mouse.move(
    summaryHandle.x + summaryHandle.width / 2,
    summaryHandle.y + summaryHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    summaryHandle.x + summaryHandle.width / 2,
    summaryHandle.y + summaryHandle.height / 2 + 24,
  );
  await page.mouse.up();
  await expect(summaryResize).toHaveAttribute("aria-valuenow", "314");
  await page.screenshot({
    path: testInfo.outputPath("compact-quantum-list-info.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse program information", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await reference.click();
  await expect(reference).toHaveAttribute("aria-current", "true");
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await info.click();
  await expect(resize).toHaveAttribute("aria-valuenow", "336");
  await expect(summaryResize).toHaveAttribute("aria-valuenow", "314");
  await variant.click();
  await expect(panel).toBeVisible();
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(resize).toHaveAttribute("aria-valuenow", "336");
  const focus = page.getByRole("button", {
    name: "Focus quantum circuit",
    exact: true,
  });
  await focus.click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeVisible();
  await info.click();
  await expect(panel).toBeHidden();
  await reference.click();
  await page
    .locator(".fq-circuit-canvas")
    .getByRole("button", { name: /^Inspect H gate / })
    .first()
    .click();
  await expect(panel).toBeVisible();
  await expect(page.locator(".fq-node-details h3")).toHaveText("H");
  expect(
    await page.evaluate(() => localStorage.getItem("fq-program-info-open-v1")),
  ).toBe("off");
  await page.reload();
  await expect(panel).toBeHidden();
  const leftResize = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  for (let step = 0; step < 3; step++)
    await leftResize.press("Shift+ArrowLeft");
  await expect(leftResize).toHaveAttribute("aria-valuenow", "170");
  expect(
    await page
      .locator(".fq-program-library")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await expect(variant).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("compact-quantum-list-narrow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await expect(panel).toBeHidden();
});

test("Execution backend uses service metadata and preserves folded limits and manual width", async ({
  page,
}, testInfo) => {
  const original = await editor(page).inputValue();
  const actual = await get(page, "/api/health");
  await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
  const backend = page.getByRole("region", {
    name: "Compute backend",
    exact: true,
  });
  const details = backend.locator("details");
  const refresh = page.getByRole("button", {
    name: "Refresh compute backend",
    exact: true,
  });
  await expect(backend).toContainText("PyTorch CPU");
  await expect(backend.locator(".fq-execution-backend-identity")).toContainText(
    actual.transport,
  );
  await expect(details).not.toHaveAttribute("open");
  await expect(page.getByText("Remote CPU", { exact: true })).toHaveCount(0);
  await expect(page.locator(".fq-execution-runtime")).toHaveCount(0);
  expect(
    (await details.locator("summary").boundingBox()).y -
      (await backend.locator("h3").boundingBox()).y,
  ).toBeLessThan(140);
  await details.locator("summary").click();
  await expect(details).toContainText(actual.max_qubits.toLocaleString());
  await expect(details).toContainText(actual.max_shots.toLocaleString());
  await page.reload();
  await expect(details).toHaveAttribute("open");
  await details.locator("summary").click();
  const resize = page.getByRole("separator", {
    name: "Resize left sidebar",
    exact: true,
  });
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 24, handle.y + 50);
  await page.mouse.up();
  await expect(resize).toHaveAttribute("aria-valuenow", "304");
  await page.reload();
  await expect(resize).toHaveAttribute("aria-valuenow", "304");
  await expect(details).not.toHaveAttribute("open");
  await page.screenshot({
    path: testInfo.outputPath("compact-execution-backend.png"),
    fullPage: true,
  });
  let phase = "custom";
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: phase === "offline" ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        phase === "offline"
          ? { error: "Metadata unavailable" }
          : phase === "custom"
            ? {
                backend: "custom_accelerator",
                transport: "cluster",
                max_qubits: 24,
                max_shots: 50000,
              }
            : { ...actual, transport: phase === "ssh" ? "SSH" : "local" },
      ),
    }),
  );
  await refresh.click();
  await expect(backend.locator("h3")).toHaveText("custom_accelerator");
  await expect(backend).not.toContainText("PyTorch CPU");
  await details.locator("summary").click();
  await expect(details).toContainText("24");
  await expect(details).toContainText((50000).toLocaleString());
  await expect(details).not.toContainText("CPU threads / task");
  await details.locator("summary").click();
  phase = "ssh";
  await refresh.click();
  await expect(backend.locator(".fq-execution-backend-identity")).toHaveText(
    "PyTorch CPUSSH",
  );
  phase = "offline";
  await refresh.click();
  await expect(backend.getByRole("alert")).toContainText(
    "Showing the last received details",
  );
  await expect(backend.locator("h3")).toHaveText("PyTorch CPU");
  await expect(
    page
      .getByRole("region", { name: "Execution configuration", exact: true })
      .getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(backend.locator("h3")).toHaveText("Backend details unavailable");
  await expect(backend.getByRole("alert")).toContainText(
    "Metadata unavailable",
  );
  phase = "local";
  await refresh.click();
  await expect(backend.locator(".fq-execution-backend-identity")).toHaveText(
    "PyTorch CPUlocal",
  );
  await expect(backend.getByRole("alert")).toHaveCount(0);
  for (let step = 0; step < 4; step++) await resize.press("Shift+ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "170");
  expect(
    await backend.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("compact-execution-backend-narrow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(original);
});

test("QAOA Max-Cut reference: scripted Agent orchestration, real optimization, comparison and reproducible archives", async ({
  page,
}, testInfo) => {
  // This journey performs multiple real SDK runs and independent replays.
  // Keep individual operation deadlines and zero retries; allow enough total
  // time for the full provenance workflow on shared CI runners.
  testInfo.setTimeout(240000);
  const { qaoaTaskPrompt, qaoaTaskName, qaoaSource } =
    await import("../src/tasks/qaoa-maxcut.mjs");
  const previousRuns = new Set(
    (await get(page, "/api/python/runs")).map((item) => item.id),
  );
  await editor(page).fill(draft);
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
  if ((await follow.getAttribute("aria-checked")) === "true")
    await follow.click();
  await page.getByRole("button", { name: /Optimize Max-Cut/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Message FlagQAI", exact: true }),
  ).toHaveValue(qaoaTaskPrompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "QAOA reference workflow verified",
    { timeout: 90000 },
  );
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "no model was called",
  );
  await expect(editor(page)).toHaveValue(draft);
  const progress = page.getByRole("region", {
    name: "Experiment progress",
    exact: true,
  });
  await expect(progress).toContainText("Experiment ready");
  await expect(progress).not.toContainText("Run needs attention");
  const outcomeCard = progress.getByRole("region", {
    name: "QAOA outcome",
    exact: true,
  });
  await expect(outcomeCard).toContainText(
    "Seeded replay matches saved results",
  );
  await expect(outcomeCard).toContainText("4.50");
  await expect(outcomeCard).toContainText("5.87");
  await outcomeCard
    .getByRole("button", { name: "View code", exact: true })
    .click();
  const savedCode = page.getByRole("dialog", {
    name: "QAOA saved code",
    exact: true,
  });
  await expect(savedCode).toContainText("EDGES");
  await savedCode
    .getByRole("button", { name: "Close saved code", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  await outcomeCard
    .getByRole("button", { name: "View circuit", exact: true })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByRole("group", {
      name: "Interactive hierarchical quantum circuit",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  const failedAttempt = (await get(page, "/api/python/runs")).find(
    (item) => !previousRuns.has(item.id) && item.status === "failed",
  );
  expect(failedAttempt).toBeTruthy();
  const history = progress.locator(".fq-experiment-run-history");
  await expect(history).not.toHaveAttribute("open");
  await history.locator("summary").click();
  await expect(history).toContainText("Earlier run issues · 1");
  await history
    .getByRole("button", {
      name: "Inspect earlier run " + failedAttempt.id,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Python run history")).toHaveValue(
    failedAttempt.id,
  );
  await expect(
    page.getByRole("region", { name: "Python output", exact: true }),
  ).toContainText("Intentional recoverable acceptance failure");
  await expect(editor(page)).toHaveValue(draft);
  await expect(progress).toContainText("Experiment ready");
  await history.locator("summary").click();
  const run = (await get(page, "/api/python/runs")).find(
    (item) => !previousRuns.has(item.id),
  );
  expect(run).toBeTruthy();
  const full = await get(page, "/api/python/runs/" + run.id);
  expect(full.status).toBe("completed");
  expect(full.collection_errors).toEqual([]);
  expect(full.experiments.map((item) => item.filename).sort()).toEqual([
    "01-maxcut-baseline.fqx",
    "02-maxcut-qaoa.fqx",
    "03-maxcut-replay.fqx",
  ]);
  const report = JSON.parse(
    full.logs
      .map((item) => item.text)
      .join("")
      .split("\n")
      .find((line) => line.startsWith("MAXCUT_REPORT="))
      .slice("MAXCUT_REPORT=".length),
  );
  expect(report.classical_optimum).toBe(7);
  expect(report.grid_evaluations).toBe(81);
  expect(report.baseline.expected_cut).toBeCloseTo(4.5, 4);
  expect(report.optimized.expected_cut).toBeGreaterThan(5.7);
  expect(report.optimized.expected_cut).toBeLessThan(7);
  expect(report.optimized.optimum_probability).toBeGreaterThan(0.35);
  expect(report.replay_matches).toBe(true);
  const baseline = await savedRecord(page, full, "01-maxcut-baseline.fqx");
  const optimized = await savedRecord(page, full, "02-maxcut-qaoa.fqx");
  const replay = await savedRecord(page, full, "03-maxcut-replay.fqx");
  expect(optimized.program.origin.source).toBe(qaoaSource);
  expect(optimized.job.result.qubits).toBe(6);
  expect(optimized.job.result.counts).toEqual(replay.job.result.counts);
  expect(optimized.job.result.counts).not.toEqual(baseline.job.result.counts);
  await page
    .getByRole("button", { name: "Compare results", exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(
    comparison.getByRole("combobox", {
      name: "Baseline experiment",
      exact: true,
    }),
  ).toHaveValue(baseline.id);
  await expect(
    comparison.getByRole("combobox", {
      name: "Variant experiment",
      exact: true,
    }),
  ).toHaveValue(optimized.id);
  await page.screenshot({
    path: testInfo.outputPath("qaoa-baseline-optimized.png"),
    fullPage: true,
  });
  await comparison
    .getByRole("combobox", { name: "Variant experiment", exact: true })
    .selectOption({ value: replay.id });
  await comparison
    .getByRole("combobox", { name: "Baseline experiment", exact: true })
    .selectOption({ value: optimized.id });
  await expect(
    comparison.getByRole("region", {
      name: "Observed differences",
      exact: true,
    }),
  ).toContainText("0.0%");
  await page.reload();
  await expect(
    comparison.getByRole("combobox", {
      name: "Variant experiment",
      exact: true,
    }),
  ).toHaveValue(replay.id);
  await expect(
    comparison.getByRole("region", {
      name: "Observed differences",
      exact: true,
    }),
  ).toContainText("0.0%");
  await expect(progress).toContainText("Experiment ready");
  await progress.locator(".fq-experiment-run-history > summary").click();
  await expect(
    progress.getByRole("button", {
      name: "Inspect earlier run " + failedAttempt.id,
      exact: true,
    }),
  ).toBeVisible();
  await progress.locator(".fq-experiment-run-history > summary").click();
  await expect(outcomeCard).toContainText(
    "Seeded replay matches saved results",
  );
  const downloaded = await page.request.get(
    `/api/experiments/${optimized.id}/file`,
  );
  expect(downloaded.ok()).toBe(true);
  expect((await downloaded.body()).length).toBeGreaterThan(100);
  await page.screenshot({
    path: testInfo.outputPath("qaoa-exact-replay.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  if ((await agent.getAttribute("aria-expanded")) === "true")
    await agent.click();
  await page.getByRole("button", { name: "MODELS", exact: true }).click();
  await page
    .getByRole("region", { name: "Reference research task", exact: true })
    .getByRole("button", { name: new RegExp(qaoaTaskName) })
    .click();
  await expect(editor(page)).toHaveValue(qaoaSource);
  const independentRun = await runPython(page);
  const independent = await savedRecord(
    page,
    independentRun,
    "02-maxcut-qaoa.fqx",
  );
  expect(independentRun.id).not.toBe(full.id);
  expect(independent.program.origin.source_hash).toBe(
    optimized.program.origin.source_hash,
  );
  expect(independent.job.result.counts).toEqual(optimized.job.result.counts);
  const retained = page.getByRole("region", { name: "My models", exact: true });
  await retained
    .getByRole("button")
    .filter({ hasText: "Python Bell pair" })
    .first()
    .click();
  await expect(editor(page)).toHaveValue(draft);
  // Prepare a new version without overwriting either editor or composer drafts.
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await composer.fill("Keep this existing chat draft.");
  const beforeIteration = (await get(page, "/api/python/runs")).length;
  await outcomeCard
    .getByRole("button", { name: "Iterate parameters", exact: true })
    .click();
  const iterationDialog = page.getByRole("dialog", {
    name: "New QAOA iteration",
    exact: true,
  });
  await expect(
    iterationDialog.getByRole("spinbutton", {
      name: "Iteration shots",
      exact: true,
    }),
  ).toHaveValue("4096");
  await iterationDialog
    .getByRole("spinbutton", { name: "QAOA layers", exact: true })
    .fill("2");
  await iterationDialog
    .getByRole("button", { name: "Prepare iteration", exact: true })
    .click();
  await expect(composer).toHaveValue(
    /^Keep this existing chat draft\.\n\nIterate the saved QAOA/,
  );
  expect((await get(page, "/api/python/runs")).length).toBe(beforeIteration);
  await expect(editor(page)).toHaveValue(draft);
  const holdIteration = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-qaoa-iteration",
  );
  await writeFile(holdIteration, "hold");
  try {
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const question = page
      .getByRole("article", { name: "Your message", exact: true })
      .last();
    await expect(question).toContainText(
      "Iterate QAOA with p=2, 4,096 shots and seed 42.",
    );
    await expect(question.locator(".fq-agent-attachment")).not.toHaveAttribute(
      "open",
    );
    const version = page
      .getByRole("region", { name: "QAOA version comparison", exact: true })
      .last();
    await expect(version).toContainText("Latest attempt failed", {
      timeout: 90000,
    });
    await expect(version).toContainText("Previous optimized result: 5.87");
    await expect(editor(page)).toHaveValue(draft);
    await rm(holdIteration, { force: true });
    await expect(
      page.locator(".fq-agent-message.assistant").last(),
    ).toContainText("QAOA iteration verified", { timeout: 90000 });
    await expect(version).toContainText("Compiled depth");
    await expect(version).toContainText("Compiled gates");
    await expect(version).toContainText("Python compute");
    await version
      .getByRole("button", { name: "Compare versions", exact: true })
      .click();
    await expect(
      comparison.getByRole("combobox", {
        name: "Baseline experiment",
        exact: true,
      }),
    ).toHaveValue(optimized.id);
    const variantID = await comparison
      .getByRole("combobox", { name: "Variant experiment", exact: true })
      .inputValue();
    expect(variantID).not.toBe(optimized.id);
    const newer = await get(page, "/api/experiments/" + variantID);
    expect(newer.program.origin.run_id).not.toBe(full.id);
    expect(newer.program.origin.source_hash).not.toBe(full.source_hash);
    expect(newer.program.compiled.depth).toBeGreaterThan(
      optimized.program.compiled.depth,
    );
    expect(newer.program.origin.source).toContain("for layer in range(2)");
    expect(
      (await page.request.get(`/api/experiments/${optimized.id}/file`)).ok(),
    ).toBe(true);
    await page.reload();
    await expect(version).toContainText("Compiled depth");
    await expect(
      comparison.getByRole("combobox", {
        name: "Baseline experiment",
        exact: true,
      }),
    ).toHaveValue(optimized.id);
    await page
      .getByRole("region", { name: "Experiment progress", exact: true })
      .last()
      .locator(".fq-experiment-run-history > summary")
      .click();
    await expect(
      page
        .getByRole("region", { name: "Experiment progress", exact: true })
        .last(),
    ).toContainText("Earlier run issues · 1");
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor(page)).toHaveValue(draft);
    const latestOutcome = page
      .getByRole("region", { name: "QAOA outcome", exact: true })
      .last();
    await latestOutcome
      .getByRole("button", { name: "View research record", exact: true })
      .click();
    const research = page.getByRole("dialog", {
      name: "Research record",
      exact: true,
    });
    await expect(
      research.getByRole("region", { name: "Research objective", exact: true }),
    ).toContainText("QAOA Max-Cut reference task");
    await expect(
      research
        .getByRole("region", { name: "Research versions", exact: true })
        .getByRole("row"),
    ).toHaveCount(5);
    await expect(research).toContainText("Model cost: unrecorded");
    const detailedRuns = await Promise.all(
      (await get(page, "/api/python/runs"))
        .filter((r) => !previousRuns.has(r.id))
        .map((r) => get(page, "/api/python/runs/" + r.id)),
    );
    const versions = detailedRuns.filter((r) =>
      r.source.includes("# FLAGQAI_QAOA_ITERATION="),
    );
    const finalVersion = versions.find((r) => r.status === "completed");
    const failedVersion = versions.find((r) => r.status === "failed");
    expect(finalVersion).toBeTruthy();
    expect(failedVersion).toBeTruthy();
    await research
      .getByRole("textbox", { name: "Research adoption reason", exact: true })
      .fill("Selected for the next QAOA experiment; depth tradeoff reviewed.");
    await research
      .getByRole("button", { name: "Adopt selected version", exact: true })
      .click();
    await expect(
      research.getByRole("region", {
        name: "Research conclusion",
        exact: true,
      }),
    ).toContainText("depth tradeoff reviewed");
    const manifestDownload = page.waitForEvent("download");
    await research
      .getByRole("button", { name: "Download research record", exact: true })
      .click();
    const manifest = JSON.parse(
      await readFile(await (await manifestDownload).path(), "utf8"),
    );
    expect(manifest.root_run).toBe(full.id);
    expect(manifest.adopted.run).toBe(finalVersion.id);
    expect(manifest.runs.filter((r) => r.status === "failed")).toHaveLength(2);
    expect(manifest.model_cost).toBe(null);
    expect(manifest.runs.find((r) => r.id === finalVersion.id).source).toBe(
      newer.program.origin.source,
    );
    await research.screenshot({
      path: testInfo.outputPath("qaoa-research-record.png"),
    });
    const bundleDownload = page.waitForEvent("download");
    await research
      .getByRole("button", { name: "Export research package", exact: true })
      .click();
    const bundle = await readFile(await (await bundleDownload).path());
    expect(bundle.subarray(0, 2).toString()).toBe("PK");
    const freshContext = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1440, height: 1000 } });
    const fresh = await freshContext.newPage();
    try {
      await fresh.goto(new URL("/#model", page.url()).href);
      const cleanDraft =
        "# Clean browser draft: keep this while restoring a research package\nprint('keep')\n";
      await editor(fresh).fill(cleanDraft);
      const beforeRestoring = (await get(fresh, "/api/python/runs")).map(
        (r) => r.id,
      );
      let nativeRunReads = 0;
      await fresh.route("**/api/python/runs/*", (route) => {
        nativeRunReads++;
        return route.abort("blockedbyclient");
      });
      const packagesBefore = (await get(fresh, "/api/research")).length;
      await fresh
        .getByRole("button", { name: "Research", exact: true })
        .click();
      const library = fresh.getByRole("dialog", {
        name: "Research packages",
        exact: true,
      });
      await library
        .getByLabel("Import research ZIP", { exact: true })
        .setInputFiles({
          name: "qaoa-research.zip",
          mimeType: "application/zip",
          buffer: bundle,
        });
      const restored = fresh.getByRole("dialog", {
        name: "Research record",
        exact: true,
      });
      await expect(restored).toContainText(
        "Imported evidence · read-only source history",
        { timeout: 60000 },
      );
      await expect(
        restored.getByRole("region", {
          name: "Research conclusion",
          exact: true,
        }),
      ).toContainText(finalVersion.id.slice(0, 8));
      await restored.evaluate((el) => (el.scrollTop = 0));
      await restored.screenshot({
        path: testInfo.outputPath("research-package-restored.png"),
      });

      await expect(
        restored.getByRole("region", {
          name: "Research objective",
          exact: true,
        }),
      ).toContainText("QAOA Max-Cut reference task");
      const firstImport = (await get(fresh, "/api/research"))[0];
      await restored
        .getByRole("button", { name: "Clear adopted version", exact: true })
        .click();
      await restored
        .getByRole("button", {
          name: "Select research run " + failedVersion.id,
          exact: true,
        })
        .click();
      await restored
        .getByRole("button", { name: "View run and logs", exact: true })
        .click();
      await expect(restored.getByLabel("Archived run output")).toContainText(
        "Intentional recoverable acceptance failure",
      );
      await restored
        .getByRole("button", { name: "Close research record", exact: true })
        .click();
      const corrupt = Buffer.from(bundle);
      corrupt[0] = 0;
      await library
        .getByLabel("Import research ZIP", { exact: true })
        .setInputFiles({
          name: "damaged.zip",
          mimeType: "application/zip",
          buffer: corrupt,
        });
      await expect(library.getByRole("alert")).toContainText("Invalid");
      expect((await get(fresh, "/api/research")).length).toBe(
        packagesBefore + 1,
      );
      await library
        .getByLabel("Import research ZIP", { exact: true })
        .setInputFiles({
          name: "qaoa-research.zip",
          mimeType: "application/zip",
          buffer: bundle,
        });
      await expect(restored).toContainText(
        "Imported evidence · read-only source history",
        { timeout: 60000 },
      );
      await expect(
        restored.getByRole("region", {
          name: "Research conclusion",
          exact: true,
        }),
      ).toContainText(finalVersion.id.slice(0, 8));
      const secondImport = (await get(fresh, "/api/research"))[0];
      expect(secondImport.id).not.toBe(firstImport.id);
      expect((await get(fresh, "/api/research")).length).toBe(
        packagesBefore + 2,
      );
      const firstData = await get(fresh, "/api/research/" + firstImport.id),
        secondData = await get(fresh, "/api/research/" + secondImport.id);
      expect(
        Object.values(secondData.local_ids).some((id) =>
          Object.values(firstData.local_ids).includes(id),
        ),
      ).toBe(false);
      await restored
        .getByRole("button", { name: "Close research record", exact: true })
        .click();
      await library
        .getByRole("button", { name: "Close research packages", exact: true })
        .click();
      await fresh.reload();
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      await fresh
        .getByRole("button", { name: "Research", exact: true })
        .click();
      await library
        .getByRole("button", { name: new RegExp(secondImport.id.slice(-8)) })
        .click();
      await expect(
        restored
          .getByRole("region", { name: "Research versions", exact: true })
          .getByRole("row"),
      ).toHaveCount(5);
      const preparation = restored.locator("details").filter({
        has: fresh
          .locator("summary")
          .filter({ hasText: /^Reproduction preparation$/ }),
      });
      await preparation.locator("summary").click();
      await preparation
        .getByRole("button", { name: "Check configured runtime", exact: true })
        .click();
      await expect(preparation).toContainText("No execution was submitted");
      expect((await get(fresh, "/api/python/runs")).map((r) => r.id)).toEqual(
        beforeRestoring,
      );
      const verification = restored.getByRole("region", {
        name: "Reproduction verification",
        exact: true,
      });
      await verification
        .getByRole("button", {
          name: "Check reproduction environment",
          exact: true,
        })
        .click();
      await expect(verification).toContainText("Environment checked", {
        timeout: 30000,
      });
      expect((await get(fresh, "/api/python/runs")).map((r) => r.id)).toEqual(
        beforeRestoring,
      );
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      const environmentDetails = verification
        .locator(".fq-environment-preparation")
        .first();
      await environmentDetails.locator("summary").click();
      await expect(environmentDetails).toContainText("Nothing was installed");
      await expect(environmentDetails).toContainText("Preparation commands");
      const environmentDownload = fresh.waitForEvent("download");
      await environmentDetails
        .getByRole("button", {
          name: "Download environment manifest",
          exact: true,
        })
        .click();
      const environmentFile = await environmentDownload;
      const environmentManifest = JSON.parse(
        await readFile(await environmentFile.path(), "utf8"),
      );
      expect(environmentManifest.schema).toBe(
        "flagqai.environment-preparation.v1",
      );
      expect(environmentManifest.installation_performed).toBe(false);
      expect(environmentManifest.current.sdk_version).toBe("0.4.0");
      expect(environmentManifest.current.packages.torch).toMatch(
        /^2\.13\.0(?:\+cpu)?$/,
      );
      expect(environmentManifest.current.sdk_code_sha256).toMatch(
        /^[a-f0-9]{64}$/,
      );
      await restored.screenshot({
        path: testInfo.outputPath("reproduction-environment-preparation.png"),
      });
      await environmentDetails.locator("summary").click();
      await verification
        .getByRole("button", {
          name: "Run archived source & verify",
          exact: true,
        })
        .click();
      await expect(verification).toContainText("Verified · exact match", {
        timeout: 90000,
      });
      await expect(verification).toContainText("Expected cut");
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      const verificationReply = await fresh.request.post(
        "/api/reproduction/list",
        { data: { package_id: secondImport.id, run_id: finalVersion.id } },
      );
      const verificationRecords = await verificationReply.json();
      expect(verificationRecords[0].source_hash).toBe(
        newer.program.origin.source_hash,
      );
      expect(verificationRecords[0].artifacts).toHaveLength(3);
      expect(
        verificationRecords[0].reproduced_runtime.environment_manifest
          .sdk_code_sha256,
      ).toBe(environmentManifest.current.sdk_code_sha256);

      expect((await get(fresh, "/api/python/runs")).length).toBe(
        beforeRestoring.length + 1,
      );
      // Retrying the same receipt never creates another task.
      await fresh.request.post("/api/reproduction/start", {
        data: { id: verificationRecords[0].id },
      });
      expect((await get(fresh, "/api/python/runs")).length).toBe(
        beforeRestoring.length + 1,
      );
      await verification.screenshot({
        path: testInfo.outputPath("research-reproduction-verified.png"),
      });
      const reportDownload = fresh.waitForEvent("download");
      await verification
        .getByRole("button", {
          name: "Download verification record",
          exact: true,
        })
        .click();
      const reportFile = await reportDownload;
      expect(
        JSON.parse(await readFile(await reportFile.path(), "utf8")).status,
      ).toBe("exact");
      await restored
        .getByRole("button", { name: "Close research record", exact: true })
        .click();
      await library
        .getByRole("button", { name: "Close research packages", exact: true })
        .click();
      await fresh.reload();
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      await fresh
        .getByRole("button", { name: "Research", exact: true })
        .click();
      await library
        .getByRole("button", { name: new RegExp(secondImport.id.slice(-8)) })
        .click();
      await expect(verification).toContainText("Verified · exact match");
      await expect(verification).toContainText(
        verificationRecords[0].run_id.slice(0, 8),
      );
      const deliveryDownload = fresh.waitForEvent("download");
      await restored
        .getByRole("button", { name: "Export research package", exact: true })
        .click();
      const deliveryFile = await deliveryDownload;
      const deliveryBytes = await readFile(await deliveryFile.path());
      await restored
        .getByRole("button", { name: "Close research record", exact: true })
        .click();
      await library
        .getByLabel("Import research ZIP", { exact: true })
        .setInputFiles({
          name: "qaoa-delivery.zip",
          mimeType: "application/zip",
          buffer: deliveryBytes,
        });
      await expect(restored).toContainText(
        "Imported evidence · read-only source history",
        { timeout: 60000 },
      );
      const archivedVerification = verification.locator(
        '[data-evidence-scope="archived"]',
      );
      await expect(archivedVerification).toHaveCount(1);
      await expect(archivedVerification).toContainText("Archived verification");
      await expect(
        verification.locator('[data-evidence-scope="current"]'),
      ).toHaveCount(0);
      const deliverySummary = restored.getByRole("region", {
        name: "Delivery verification summary",
        exact: true,
      });
      await expect(deliverySummary).toContainText(
        "Not verified in the current environment",
      );
      await expect(deliverySummary).toContainText(
        "Archived verification: 1 records · 1 passing",
      );
      await expect(
        archivedVerification.getByRole("button", {
          name: "Run archived source & verify",
          exact: true,
        }),
      ).toHaveCount(0);
      await archivedVerification
        .getByRole("button", { name: "View reproduction logs", exact: true })
        .click();
      await expect(archivedVerification).toContainText(
        "Run " + verificationRecords[0].run_id + " · completed",
      );
      expect(nativeRunReads).toBe(0);
      expect((await get(fresh, "/api/python/runs")).length).toBe(
        beforeRestoring.length + 1,
      );
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      await verification
        .getByRole("button", {
          name: "Check reproduction environment",
          exact: true,
        })
        .click();
      await expect(
        verification.locator('[data-evidence-scope="current"]'),
      ).toContainText("Environment checked", { timeout: 30000 });
      await verification
        .locator('[data-evidence-scope="current"]')
        .getByRole("button", {
          name: "Run archived source & verify",
          exact: true,
        })
        .click();
      await expect(
        verification.locator('[data-evidence-scope="current"]'),
      ).toContainText("Verified · exact match", { timeout: 90000 });
      await expect(deliverySummary).toContainText(
        "Current environment: 1 records · 1 passing",
      );
      await expect(archivedVerification).toHaveCount(1);
      await expect(editor(fresh)).toHaveValue(cleanDraft);
      expect((await get(fresh, "/api/python/runs")).length).toBe(
        beforeRestoring.length + 2,
      );
      await restored.screenshot({
        path: testInfo.outputPath("research-delivery-archive-and-current.png"),
      });
      await preparation.locator("summary").click();
      await preparation
        .getByRole("button", { name: "Open source in editor", exact: true })
        .click();
      await expect(editor(fresh)).toHaveValue(newer.program.origin.source);
      expect(
        await fresh.evaluate(
          (source) =>
            JSON.parse(
              localStorage.getItem("fq-react-workspace-v1"),
            ).models.some((m) => m.source === source),
          cleanDraft,
        ),
      ).toBe(true);
      expect(nativeRunReads).toBe(0);
      await fresh.unroute("**/api/python/runs/*");
      const explicitReplay = await runPython(fresh);
      expect(explicitReplay.source_hash).toBe(newer.program.origin.source_hash);
      expect(explicitReplay.id).not.toBe(full.id);
      expect(
        (await savedRecord(fresh, explicitReplay, "02-maxcut-qaoa.fqx")).job
          .result.counts,
      ).toEqual(newer.job.result.counts);
      await fresh.screenshot({
        path: testInfo.outputPath("research-package-explicit-reproduction.png"),
        fullPage: true,
      });
    } finally {
      await freshContext.close();
    }

    await research
      .getByRole("button", { name: "Close research record", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("region", { name: "QAOA outcome", exact: true })
      .first()
      .getByRole("button", { name: "View research record", exact: true })
      .click();
    await expect(
      research.getByRole("region", {
        name: "Research conclusion",
        exact: true,
      }),
    ).toContainText(finalVersion.id.slice(0, 8));
    await research
      .getByRole("button", {
        name: "Select research run " + failedVersion.id,
        exact: true,
      })
      .click();
    await expect(
      research.getByRole("button", {
        name: "Adopt selected version",
        exact: true,
      }),
    ).toHaveCount(0);
    await research
      .getByRole("button", { name: "View run and logs", exact: true })
      .click();
    await expect(page.getByLabel("Python run history")).toHaveValue(
      failedVersion.id,
    );
    await expect(editor(page)).toHaveValue(draft);
    await page
      .getByRole("region", { name: "QAOA outcome", exact: true })
      .first()
      .getByRole("button", { name: "View research record", exact: true })
      .click();
    await research
      .getByRole("button", {
        name: "Select research run " + finalVersion.id,
        exact: true,
      })
      .click();
    await research
      .getByRole("button", { name: "Compare with baseline", exact: true })
      .click();
    await expect(
      comparison.getByRole("combobox", {
        name: "Baseline experiment",
        exact: true,
      }),
    ).toHaveValue(optimized.id);
    await expect(
      comparison.getByRole("combobox", {
        name: "Variant experiment",
        exact: true,
      }),
    ).toHaveValue(variantID);
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor(page)).toHaveValue(draft);
    await version.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("qaoa-iteration-versions.png"),
      fullPage: true,
    });
  } finally {
    await rm(holdIteration, { force: true });
  }
});

test("reviewed Agent snapshots save independently, reject stale validation and run exact merged code with undo and failure history", async ({
  page,
}, testInfo) => {
  await editor(page).fill(bell);
  const shared = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/editor/files") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Share with Agent", exact: true })
    .click();
  const file = await (await shared).json();
  const root = (await get(page, "/api/projects")).workspace_root;
  const path = join(root, file.path);
  const local = bell + "# My unsaved draft stays recoverable\n";
  await editor(page).fill(local);
  const proposal = bell.replace(
    "result = fq.run",
    "circuit.x(1)\nresult = fq.run",
  );
  await writeFile(path, proposal);
  const reviewButton = page.getByRole("button", {
    name: "Review changes",
    exact: true,
  });
  await expect(reviewButton).toBeVisible();
  await reviewButton.click();
  const review = page.getByRole("dialog", {
    name: "Review Agent code changes",
    exact: true,
  });
  const base = review.locator(".fq-review-base");
  await base.locator("summary").click();
  await expect(base).toContainText("Shared base");
  await expect(base).toContainText("My unsaved draft");
  await review
    .getByRole("button", {
      name: "Save proposal as independent version",
      exact: true,
    })
    .click();
  await expect(review).toContainText("Your draft and disk file are unchanged");
  const models = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).models,
    );
  expect(
    (await models()).some(
      (m) => m.source === proposal && m.reviewOrigin?.fileId === file.id,
    ),
  ).toBe(true);
  expect(await readFile(path, "utf8")).toBe(proposal);
  await review
    .getByRole("button", { name: "Close code review", exact: true })
    .click();
  await page.reload();
  await expect(editor(page)).toHaveValue(local);
  expect(
    (await models()).some(
      (m) => m.source === proposal && m.reviewOrigin?.fileId === file.id,
    ),
  ).toBe(true);
  await reviewButton.click();
  const before = (await get(page, "/api/python/runs")).map((r) => r.id);
  let release, arrive;
  const gate = new Promise((resolve) => (release = resolve)),
    arrived = new Promise((resolve) => (arrive = resolve));
  await page.route("**/api/python/check", async (route) => {
    arrive();
    await gate;
    await route.continue();
  });
  try {
    await review
      .getByRole("button", { name: "Accept & run", exact: true })
      .click();
    await arrived;
    await writeFile(path, proposal + "# newer Agent revision during review\n");
    await expect(review).toContainText(
      "The editor or Agent file changed while this review was open",
    );
    release();
    await expect(review).toContainText("nothing was run");
    expect((await get(page, "/api/python/runs")).map((r) => r.id)).toEqual(
      before,
    );
    await expect(editor(page)).toHaveValue(local);
  } finally {
    release();
    await page.unroute("**/api/python/check");
  }
  await review
    .getByRole("button", { name: "Close code review", exact: true })
    .click();
  await writeFile(path, "def broken(\n");
  await expect
    .poll(async () => (await get(page, "/api/editor/files/" + file.id)).source)
    .toBe("def broken(\n");
  await reviewButton.click();
  // Wait for the polling observer if this review initially captured the previous revision.
  if (!(await review.textContent()).includes("broken")) {
    await expect(
      review.getByRole("button", { name: "Refresh comparison" }),
    ).toBeVisible();
    await review.getByRole("button", { name: "Refresh comparison" }).click();
  }
  await review
    .getByRole("button", { name: "Accept & run", exact: true })
    .click();
  await expect(review.getByRole("alert")).toContainText(
    "Syntax error at line 1",
  );
  expect((await get(page, "/api/python/runs")).map((r) => r.id)).toEqual(
    before,
  );
  await expect(editor(page)).toHaveValue(local);
  await review
    .getByRole("button", { name: "Close code review", exact: true })
    .click();
  const failing = 'raise RuntimeError("Reviewed runtime failure retained")\n';
  await writeFile(path, failing);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fq-react-workspace-v1")).editorLink
            ?.incoming?.source,
      ),
    )
    .toBe(failing);
  await reviewButton.click();
  await review
    .getByRole("button", { name: "Accept & run", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await expect(editor(page)).toHaveValue(failing);
  let failed;
  await expect
    .poll(
      async () => {
        failed = (await get(page, "/api/python/runs")).find(
          (r) => !before.includes(r.id),
        );
        return failed?.status;
      },
      { timeout: 90000 },
    )
    .toBe("failed");
  expect((await get(page, "/api/python/runs/" + failed.id)).source).toBe(
    failing,
  );
  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
  await page.reload();
  await expect(editor(page)).toHaveValue(local);
  await writeFile(path, proposal + "# final Agent proposal\n");
  await expect(reviewButton).toBeVisible();
  await reviewButton.click();
  const merge = review.locator(".fq-review-merge");
  await merge.locator("summary").click();
  const merged = proposal + "# Human-reviewed merged version\n";
  await merge
    .getByRole("textbox", { name: "Reviewed merged code", exact: true })
    .fill(merged);
  await merge
    .getByRole("button", { name: "Save reviewed version", exact: true })
    .click();
  const ids = new Set((await get(page, "/api/python/runs")).map((r) => r.id));
  await merge
    .getByRole("button", { name: "Apply & run reviewed code", exact: true })
    .dblclick();
  await expect(review).toHaveCount(0);
  let success;
  await expect
    .poll(
      async () => {
        success = (await get(page, "/api/python/runs")).find(
          (r) => !ids.has(r.id),
        );
        return success?.status;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
  const complete = await get(page, "/api/python/runs/" + success.id);
  expect(complete.source).toBe(merged);
  expect(
    (await get(page, "/api/python/runs")).filter((r) => !ids.has(r.id)),
  ).toHaveLength(1);
  const saved = await savedRecord(page, complete, "bell.fqx");
  expect(Object.keys(saved.job.result.counts).sort()).toEqual(["01", "10"]);
  expect(await readFile(path, "utf8")).toBe(
    proposal + "# final Agent proposal\n",
  );
  await expect(editor(page)).toHaveValue(merged);
  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
  await page.reload();
  await expect(editor(page)).toHaveValue(local);
  expect((await models()).some((m) => m.source === merged)).toBe(true);
  await page.getByLabel("Python run history").selectOption(failed.id);
  await expect(
    page.getByRole("region", { name: "Python failure", exact: true }),
  ).toContainText("Reviewed runtime failure retained");
  await expect(editor(page)).toHaveValue(local);
  await page.screenshot({
    path: testInfo.outputPath("reviewed-version-and-failure-history.png"),
    fullPage: true,
  });
});

test("reviewed OpenQASM compilation uses the accepted snapshot instead of the previous draft", async ({
  page,
}) => {
  await page.getByRole("button", { name: "OpenQASM", exact: true }).click();
  const base =
    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\n';
  const proposal =
    base + "cx q[0],q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];\n";
  await editor(page).fill(base);
  const shared = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/editor/files") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Share with Agent", exact: true })
    .click();
  const file = await (await shared).json(),
    root = (await get(page, "/api/projects")).workspace_root;
  const local = base + "// unsaved local notes\n";
  await editor(page).fill(local);
  await writeFile(join(root, file.path), proposal);
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const compilation = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/compile",
  );
  await page
    .getByRole("button", { name: "Accept & compile", exact: true })
    .click();
  const response = await compilation;
  expect(response.request().postDataJSON().source).toBe(proposal);
  expect(response.ok(), JSON.stringify(await response.json())).toBe(true);
  await expect(page).toHaveURL(/#program$/, { timeout: 90000 });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(proposal);
  const programs = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).programs,
  );
  expect(programs[0].source).toBe(proposal);
  expect(
    programs[0].compiled.instructions.some(
      (g) => g.name.toLowerCase() === "cx",
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
});

async function maxcutUserJourney(page, testInfo, weighted) {
  testInfo.setTimeout(240000);
  const graphName = weighted ? "weighted five-node Max-Cut" : "five-node cycle";
  const auditName = weighted ? "weighted-maxcut" : "five-cycle";
  const { fiveCyclePrompt: taskPrompt, fiveCycleSource: taskSource } = weighted
    ? await import("./weighted-maxcut-task.mjs").then((task) => ({
        fiveCyclePrompt: task.weightedMaxcutPrompt,
        fiveCycleSource: task.weightedMaxcutSource,
      }))
    : await import("./five-cycle-task.mjs");
  await editor(page).fill(draft);
  const agentButton = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agentButton.getAttribute("aria-expanded")) !== "true")
    await agentButton.click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  const follow = page.getByRole("switch", { name: /Follow Agent/ });
  if ((await follow.getAttribute("aria-checked")) === "true")
    await follow.click();
  const before = new Set(
    (await get(page, "/api/python/runs")).map((r) => r.id),
  );
  await page
    .getByRole("textbox", { name: "Message FlagQAI", exact: true })
    .fill(taskPrompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".fq-agent-message.assistant").last(),
  ).toContainText("QAOA reference workflow verified", { timeout: 90000 });
  const progress = page
    .getByRole("region", { name: "Experiment progress", exact: true })
    .last();
  await expect(progress).toBeVisible();
  await expect(progress).not.toContainText("Run needs attention");
  await expect(editor(page)).toHaveValue(draft);
  const newRuns = (await get(page, "/api/python/runs")).filter(
    (r) => !before.has(r.id),
  );
  const baseline = await get(
    page,
    "/api/python/runs/" + newRuns.find((r) => r.status === "completed").id,
  );
  const optimized = await savedRecord(page, baseline, "02-maxcut-qaoa.fqx");
  expect(optimized.program.compiled.qubits).toBe(5);
  expect(baseline.source).toBe(taskSource);
  expect(baseline.logs.map((l) => l.text).join("")).toContain(
    weighted ? '"classical_optimum": 6.5' : '"classical_optimum": 4',
  );
  if (weighted) {
    const card = page
      .getByRole("region", { name: "QAOA outcome", exact: true })
      .last();
    await expect(card).toContainText("6 weighted edges · optimum 6.5");
    await expect(card).toContainText("Expected cut weight");
    await expect(card).toContainText("3.50");
    await expect(card).toContainText("4.99");
  }
  const failed = newRuns.find((r) => r.status === "failed");
  expect(failed).toBeTruthy();
  // Opening the Agent's model is an explicit UI action and keeps the older draft.
  await page.locator(".fq-agent-work > summary").last().click();
  await page
    .locator(".fq-workspace-artifact")
    .filter({
      hasText: weighted ? graphName : "QAOA Max-Cut · five-node cycle",
    })
    .getByRole("button", { name: "Open model ↗", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(taskSource);
  const local = taskSource + "# My unsaved review note\n";
  await editor(page).fill(local);
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fq-react-workspace-v1")),
  );
  expect(state.models.some((m) => m.source === draft)).toBe(true);
  const path = join(
    (await get(page, "/api/projects")).workspace_root,
    state.editorLink.path,
  );
  const lineage = {
    version: 1,
    run: baseline.id,
    source: baseline.source_hash,
    archive: optimized.id,
    sha256: optimized.program.experiment.sha256,
    layers: 1,
    shots: 1024,
    seed: 43,
  };
  const proposal =
    "# FLAGQAI_QAOA_ITERATION=" +
    JSON.stringify(lineage) +
    "\n" +
    taskSource.replace("5, 4096, 42, 9", "5, 1024, 43, 7");
  // Deterministic stand-in for an Agent file edit; no reasoning/model call is claimed.
  await writeFile(path, proposal);
  const reviewButton = page.getByRole("button", {
    name: "Review changes",
    exact: true,
  });
  await expect(reviewButton).toBeVisible();
  await reviewButton.click();
  const review = page.getByRole("dialog", {
    name: "Review Agent code changes",
    exact: true,
  });
  const merge = review.locator(".fq-review-merge");
  await merge.locator("summary").click();
  const accepted = proposal + "# My reviewed note is retained\n";
  await merge
    .getByRole("textbox", { name: "Reviewed merged code", exact: true })
    .fill(accepted);
  const runsBeforeReview = new Set(
    (await get(page, "/api/python/runs")).map((r) => r.id),
  );
  await merge
    .getByRole("button", { name: "Apply & run reviewed code", exact: true })
    .click();
  let reviewed;
  await expect
    .poll(
      async () => {
        const candidate = (await get(page, "/api/python/runs")).find(
          (r) => !runsBeforeReview.has(r.id),
        );
        if (candidate)
          reviewed = await get(page, "/api/python/runs/" + candidate.id);
        return reviewed?.status;
      },
      { timeout: 90000 },
    )
    .toBe("completed");
  expect(reviewed.source).toBe(accepted);
  const reviewedOptimized = await savedRecord(
    page,
    reviewed,
    "02-maxcut-qaoa.fqx",
  );
  expect(reviewedOptimized.program.compiled.qubits).toBe(5);
  expect(
    Object.values(reviewedOptimized.job.result.counts).reduce(
      (a, b) => a + b,
      0,
    ),
  ).toBe(1024);

  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
  const outcome = page
    .locator(".fq-python-console")
    .getByRole("button", { name: "View research record", exact: true });
  await expect(outcome).toBeVisible();
  await outcome.click();
  const research = page.getByRole("dialog", {
    name: "Research record",
    exact: true,
  });
  await expect(
    research.getByRole("region", { name: "Research objective", exact: true }),
  ).toContainText(graphName);
  await research
    .getByRole("textbox", { name: "Research adoption reason", exact: true })
    .fill(
      `Use the reviewed ${graphName} source; sampling settings differ from the baseline.`,
    );
  await research
    .getByRole("button", { name: "Adopt selected version", exact: true })
    .click();
  await research
    .getByRole("button", { name: "Compare with baseline", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Research record", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Baseline experiment", exact: true }),
  ).toHaveValue(optimized.id);
  await expect(
    page.getByRole("combobox", { name: "Variant experiment", exact: true }),
  ).toHaveValue(reviewedOptimized.id);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(local);
  await outcome.click();
  const verification = research.getByRole("region", {
    name: "Reproduction verification",
    exact: true,
  });
  await verification
    .getByRole("button", {
      name: "Check reproduction environment",
      exact: true,
    })
    .click();
  await expect(verification).toContainText("Environment checked", {
    timeout: 30000,
  });
  const receiptResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/reproduction/start") &&
      r.request().method() === "POST",
  );
  await verification
    .getByRole("button", { name: "Run archived source & verify", exact: true })
    .click();
  const receipt = await (await receiptResponse).json();
  const countAfterSubmit = (await get(page, "/api/python/runs")).length;
  await page.route("**/api/reproduction/list", (route) =>
    route.abort("connectionfailed"),
  );
  await expect(verification.getByRole("alert")).toContainText(
    "Verification updates interrupted",
  );
  const summary = research.getByRole("region", {
    name: "Delivery verification summary",
    exact: true,
  });
  await expect(summary).toContainText("Current environment: unavailable");
  await page.reload();
  await expect(editor(page)).toHaveValue(local);
  await outcome.click();
  await expect(summary).toContainText("Current environment: unavailable");
  expect((await get(page, "/api/python/runs")).length).toBe(countAfterSubmit);
  await page.unroute("**/api/reproduction/list");
  await expect(verification).toContainText("Verified · exact match", {
    timeout: 90000,
  });
  await expect(verification).toContainText(receipt.run_id.slice(0, 8));
  await expect(summary).toContainText(
    "Current environment: 1 records · 1 passing",
  );
  expect((await get(page, "/api/python/runs")).length).toBe(countAfterSubmit);
  // A later outage must not continue to certify the previous green count.
  await page.route("**/api/reproduction/list", (route) =>
    route.abort("connectionfailed"),
  );
  await expect(summary).toContainText("Current environment: unavailable");
  await expect(summary).not.toContainText(
    "Current environment: 1 records · 1 passing",
  );
  await expect(
    verification.locator('[data-evidence-scope="current"]'),
  ).toHaveAttribute("data-updates-interrupted", "true");
  await verification.screenshot({
    path: testInfo.outputPath(`${auditName}-verification-offline.png`),
  });
  await page.unroute("**/api/reproduction/list");
  await expect(summary).toContainText(
    "Current environment: 1 records · 1 passing",
  );
  const downloadPromise = page.waitForEvent("download");
  await research
    .getByRole("button", { name: "Export research package", exact: true })
    .click();
  const exported = await downloadPromise;
  const buffer = await readFile(await exported.path());
  await writeFile(
    testInfo.outputPath(`${auditName}-reviewed-delivery.zip`),
    buffer,
  );
  await research
    .getByRole("button", { name: "Close research record", exact: true })
    .click();
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const fresh = await context.newPage();
    await fresh.goto(page.url());
    await expect(editor(fresh)).toBeVisible();
    const handoffDraft = "# Independent handoff draft\n";
    await editor(fresh).fill(handoffDraft);
    await fresh.getByRole("button", { name: "Research", exact: true }).click();
    const library = fresh.getByRole("dialog", {
      name: "Research packages",
      exact: true,
    });
    await library
      .getByLabel("Import research ZIP", { exact: true })
      .setInputFiles({
        name: `${auditName}.zip`,
        mimeType: "application/zip",
        buffer,
      });
    const restored = fresh.getByRole("dialog", {
      name: "Research record",
      exact: true,
    });
    await expect(restored).toContainText("read-only source history", {
      timeout: 60000,
    });
    await expect(
      restored.getByRole("region", { name: "Research objective", exact: true }),
    ).toContainText(graphName);
    await expect(
      restored.getByRole("button", {
        name: "Select research run " + reviewed.id,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      restored.getByRole("region", {
        name: "Delivery verification summary",
        exact: true,
      }),
    ).toContainText("Not verified in the current environment");
    const freshVerification = restored.getByRole("region", {
      name: "Reproduction verification",
      exact: true,
    });
    await expect(
      freshVerification.locator('[data-evidence-scope="archived"]'),
    ).toHaveCount(1);
    await freshVerification
      .getByRole("button", {
        name: "Check reproduction environment",
        exact: true,
      })
      .click();
    await expect(
      freshVerification.locator('[data-evidence-scope="current"]'),
    ).toContainText("Environment checked", { timeout: 30000 });
    const independentSubmission = fresh.waitForResponse(
      (r) =>
        r.url().endsWith("/api/reproduction/start") &&
        r.request().method() === "POST",
    );
    await freshVerification
      .locator('[data-evidence-scope="current"]')
      .getByRole("button", {
        name: "Run archived source & verify",
        exact: true,
      })
      .click();
    const independentReceipt = await (await independentSubmission).json();
    expect(independentReceipt.original_run).toBe(reviewed.id);
    expect(independentReceipt.source_hash).toBe(reviewed.source_hash);

    await expect(
      freshVerification.locator('[data-evidence-scope="current"]'),
    ).toContainText("Verified · exact match", { timeout: 90000 });
    await expect(editor(fresh)).toHaveValue(handoffDraft);
    await restored.screenshot({
      path: testInfo.outputPath(`${auditName}-independent-verification.png`),
    });
  } finally {
    await context.close();
  }
  expect((await get(page, "/api/python/runs/" + failed.id)).status).toBe(
    "failed",
  );
  await expect(editor(page)).toHaveValue(local);
  const sdkReport = (run) =>
    JSON.parse(
      run.logs
        .map((log) => log.text)
        .join("")
        .split("\n")
        .find((line) => line.startsWith("MAXCUT_REPORT="))
        .slice("MAXCUT_REPORT=".length),
    );
  await writeFile(
    testInfo.outputPath(`${auditName}-user-audit.json`),
    JSON.stringify(
      {
        status: "passed",
        graph: graphName,
        agent_input:
          "scripted protocol and deterministic file-edit fixture; no reasoning model called",
        model_calls: 0,
        baseline_run: baseline.id,
        reviewed_run: reviewed.id,
        accepted_source_hash: reviewed.source_hash,
        verification_receipt: receipt.id,
        preserved_failure: failed.id,
        baseline: sdkReport(baseline),
        reviewed: sdkReport(reviewed),
        connection_loss:
          "verification history reads failed during execution and after success; refresh retained receipt and no task was resubmitted",
        drafts_preserved: true,
        independent_import_and_verification: true,
      },
      null,
      2,
    ),
  );
}
test("five-cycle user journey: reviewed parameters, offline recovery and independent delivery retain drafts", async ({
  page,
}, testInfo) => {
  await maxcutUserJourney(page, testInfo, false);
});
test("weighted Max-Cut user journey: review, reconnect and independent reproduction preserve drafts", async ({
  page,
}, testInfo) => {
  await maxcutUserJourney(page, testInfo, true);
});
