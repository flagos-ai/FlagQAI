import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Portable declared-metadata fixture. Local acceptance can instead supply an
// actual compiler-produced archive through FQ_SYNTH_SOURCE_ARCHIVE.
const fixture = `from dataclasses import replace
import flagquantum as fq
from flagquantum_web import publish
plan = fq.compile(fq.Circuit(2).h(0).cx(0, 1))
manifest = {"schema": "flagquantum.synthesis-source.v1", "entry": "fixture",
            "nodes": [{"id": "prepare", "label": "Prepare", "line": 4}, {"id": "entangle", "label": "Entangle", "line": 5}]}
program = replace(plan, metadata={**plan.metadata, "flagquantum.synthesis": manifest},
                  instructions=tuple(replace(g, metadata={**g.metadata, "flagquantum.synthesis.origins": origins})
                                     for g, origins in zip(plan.instructions, [["prepare"], ["prepare", "entangle"]])))
fq.save("attribution.fqx", program)
publish(program, name="Declared attribution fixture")
`;
async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("saved synthesis attribution preserves semantic groups, gate order and drafts", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Preserve my research draft\nprint('retain')\n";
  await editor.fill(draft);
  let record;
  if (process.env.FQ_SYNTH_SOURCE_ARCHIVE) {
    const response = await page.request.post(
      "/api/experiments?name=polynomial.fqx",
      {
        headers: { "Content-Type": "application/octet-stream" },
        data: await readFile(process.env.FQ_SYNTH_SOURCE_ARCHIVE),
      },
    );
    expect(response.ok()).toBeTruthy();
    record = await response.json();
  } else {
    const response = await page.request.post("/api/python/runs", {
      data: { source: fixture, name: "Declared attribution fixture" },
    });
    expect(response.ok()).toBeTruthy();
    const submitted = await response.json();
    let run;
    await expect
      .poll(async () => {
        run = await get(page, "/api/python/runs/" + submitted.id);
        return run.collection_status;
      })
      .toBe("completed");
    expect(run.status).toBe("completed");
    expect(run.collection_errors || []).toEqual([]);
    record = await get(page, "/api/experiments/" + run.experiments[0].id);
    expect(run.artifact.program.compiled.hierarchy).toEqual(
      record.program.compiled.hierarchy,
    );
  }
  const compiled = record.program.compiled;
  expect(compiled.hierarchy.kind).toBe("semantic");
  const before = (await get(page, "/api/python/runs")).map((run) => run.id);
  // The direct API setup occurs after the initial library read; reopening the
  // page exercises normal persisted-archive restoration rather than injecting UI state.
  await page.reload();
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Open quantum program " + record.program.name,
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Synthesis structure", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Gate sequence", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-module-frame]")).toHaveCount(
    compiled.hierarchy.children.length,
  );
  const first = compiled.hierarchy.children[0];
  const select = page
    .getByRole("button", { name: "Select " + first.label, exact: true })
    .first();
  await select.focus();
  await select.press("Enter");
  await expect(page.locator(".fq-node-details h3")).toHaveText(first.label);
  const attribution = page.getByRole("region", {
    name: "Compiler source attribution",
  });
  const captured = compiled.synthesis_sources.find(
    ({ id }) => id === first.source_ids[0],
  );
  await expect(attribution).toContainText(captured.operation || captured.label);
  if (captured.line)
    await expect(attribution).toContainText(
      `captured source line ${captured.line}`,
    );
  if (process.env.FQ_SYNTH_SOURCE_ARCHIVE) {
    const operation = compiled.synthesis_sources.find(
      ({ operation, action, line }) => operation && action && line,
    );
    const module = compiled.hierarchy.children.find(({ source_ids }) =>
      source_ids.includes(operation.id),
    );
    await page
      .getByRole("button", { name: "Select " + module.label, exact: true })
      .first()
      .press("Enter");
    await expect(attribution).toContainText(
      `${operation.operation} · ${operation.action} · captured source line ${operation.line}`,
    );
  }
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("synthesis-attribution.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Circuit detail", exact: true })
    .selectOption("100");
  await expect(
    page.locator(".fq-circuit-symbol[aria-label^='Inspect']"),
  ).toHaveCount(compiled.instructions.length);
  if (!process.env.FQ_SYNTH_SOURCE_ARCHIVE) {
    await page
      .getByRole("button", { name: "Inspect CX gate 2", exact: true })
      .click();
    await expect(attribution).toContainText("Combined compiler sources");
    await expect(attribution.getByRole("listitem")).toHaveCount(2);
    await expect(attribution).toContainText(
      "Entangle · captured source line 5",
    );
  }
  const labels = await page
    .locator(".fq-circuit-symbol[aria-label^='Inspect']")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")),
    );
  expect(labels).toEqual(
    compiled.instructions.map(
      (gate, index) => `Inspect ${gate.name.toUpperCase()} gate ${index + 1}`,
    ),
  );
  await page.reload();
  await expect(
    page.getByText("Synthesis structure", { exact: true }),
  ).toBeVisible();
  expect((await get(page, "/api/python/runs")).map((run) => run.id)).toEqual(
    before,
  );
  const reopened = await get(page, "/api/experiments/" + record.id);
  expect(reopened.program.experiment.sha256).toBe(
    record.program.experiment.sha256,
  );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});

test("Jobs inspects saved gates in place and resets attribution between results", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# keep the original source\nprint('draft')\n";
  await editor.fill(draft);
  const before = new Set(
    (await get(page, "/api/python/runs")).map(({ id }) => id),
  );
  const source = fixture.replace(
    'fq.save("attribution.fqx", program)',
    `result = fq.run(program)
fq.save("attributed-result.fqx", result.plan, result=result)
plain = fq.run(fq.Circuit(1).rx(0, 0.7853981633974483))
fq.save("plain-result.fqx", plain.plan, result=plain)`,
  );
  const response = await page.request.post("/api/python/runs", {
    data: { source, name: "Inspect saved gates" },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  await expect
    .poll(async () => {
      const run = await get(page, "/api/python/runs/" + id);
      return run.collection_status;
    })
    .toBe("completed");

  await page.reload();
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  const open = (name) =>
    page.getByRole("button", { name: `Open job ${name}`, exact: true }).click();
  const circuit = page.getByRole("button", { name: "Circuit", exact: true });
  const attribution = page.getByRole("region", {
    name: "Compiler source attribution",
  });
  await open("attributed-result");
  await circuit.click();
  const cx = page.getByRole("button", {
    name: "Inspect CX gate 2",
    exact: true,
  });
  await cx.press("Enter");
  await expect(cx).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/#jobs$/);
  await expect(
    page.getByRole("status").filter({ hasText: "CX · Gate 2 · Qubits 0, 1" }),
  ).toBeVisible();
  await expect(attribution.getByRole("listitem")).toHaveCount(2);

  await open("plain-result");
  await circuit.click();
  const rx = page.getByRole("button", {
    name: "Inspect RX gate 1",
    exact: true,
  });
  await expect(rx).toHaveAttribute("aria-pressed", "false");
  await rx.click();
  await expect(page.locator(".fq-preview-gate-details")).toContainText("π/4");
  await expect(attribution).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open in Quantum →", exact: true })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
  expect(
    (await get(page, "/api/python/runs"))
      .filter(({ id }) => !before.has(id))
      .map(({ id }) => id),
  ).toEqual([id]);
});
