import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const snapshot = JSON.parse(
  await readFile(new URL("../src/data/synthesis-files.json", import.meta.url)),
);

test("repository folders open original Python including large files without execution or draft loss", async ({
  page,
}, testInfo) => {
  let executions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/runs$|\/execute$/.test(request.url()))
      executions++;
  });
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = '# retained original draft\nprint("keep")';
  await editor.fill(draft);
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  const tree = page.getByRole("region", {
    name: "FlagQuantum synthesis files",
  });
  const folder = tree.getByRole("button", {
    name: "applications",
    exact: true,
  });
  expect(
    await folder.evaluate(
      (element) => getComputedStyle(element).justifyContent,
    ),
  ).toBe("flex-start");
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  const search = page.getByRole("textbox", { name: "Search models" });
  const paths = [
    "applications/physical_systems/hhl_lanchester/physics.py",
    "community/basic_examples/superposition/main.py",
  ];
  for (const path of paths) {
    await search.fill(path);
    await tree.getByRole("button", { name: path, exact: true }).click();
    const entry = snapshot.entries.find((file) => file.path === path);
    const raw = await readFile(
      new URL("../public" + entry.url, import.meta.url),
      "utf8",
    );
    await expect(editor).toHaveValue(raw);
  }
  await page.reload();
  await expect(editor).toHaveValue(
    await readFile(
      new URL(
        "../public" +
          snapshot.entries.find((file) => file.path === paths[1]).url,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(
    await page.evaluate(
      (text) =>
        Object.values(localStorage).some((value) => value.includes(text)),
      "retained original draft",
    ),
  ).toBe(true);
  await search.fill("README.md");
  await tree.getByRole("button", { name: "README.md", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "README.md", exact: true }),
  ).toBeVisible();
  expect(executions).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("synthesis-file-tree.png"),
  });
});

test("source-tree Run executes original companion imports and preserves frozen inputs", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#model");
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  const path =
    "applications/automotive/cooling_systems_optimization/overview/main.py";
  await page.getByRole("textbox", { name: "Search models" }).fill(path);
  await page
    .getByRole("region", { name: "FlagQuantum synthesis files" })
    .getByRole("button", { name: path, exact: true })
    .click();
  const before = new Set(
    (await (await page.request.get("/api/python/runs")).json()).map(
      (run) => run.id,
    ),
  );
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  let run;
  await expect
    .poll(
      async () => {
        const newest = (
          await (await page.request.get("/api/python/runs")).json()
        ).find((run) => !before.has(run.id));
        if (!newest) return "waiting";
        run = await (
          await page.request.get("/api/python/runs/" + newest.id)
        ).json();
        return run.status;
      },
      { timeout: 100000 },
    )
    .not.toMatch(/^(waiting|queued|running)$/);
  expect(run.status, JSON.stringify(run)).toBe("completed");
  expect(run.synthesis.path).toBe(path);
  expect(run.logs.map((row) => row.text).join("")).toContain(
    "Signed QSVT temperatures:",
  );
  const evidenceResponse = await page.request.get(
    `/api/python/runs/${run.id}/evidence`,
  );
  expect(evidenceResponse.ok()).toBeTruthy();
  const evidence = await evidenceResponse.json();
  expect(evidence.inputs.entry).toBe("examples/synthesis/" + path);
  expect(Object.keys(evidence.inputs.files).length).toBeGreaterThan(1300);
});
