import { test, expect } from "@playwright/test";

test("checked simulator profile records actual execution and the hardware catalog cannot submit", async ({
  page,
}) => {
  await page.goto("/#model");
  await page.getByRole("button", { name: "OpenQASM", exact: true }).click();
  const draft =
    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nx q[0];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];\n';
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await editor.fill(draft);
  const get = async (path) => {
    const response = await page.request.get(path);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const old = await get("/api/execution-profile");
  const oldJobs = new Set((await get("/api/jobs")).map(({ id }) => id));
  await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
  await page
    .getByText("Simulator and hardware targets", { exact: true })
    .click();
  const profile = page.getByRole("region", {
    name: "Execution target and simulator settings",
  });
  const run = page.getByRole("button", { name: "Run", exact: true });
  await profile.getByRole("button", { name: "Real QPU", exact: true }).click();
  await expect(run).toBeDisabled();
  await expect(
    profile.getByRole("combobox", { name: "Real QPU device" }),
  ).toBeDisabled();
  expect((await get("/api/jobs")).every(({ id }) => oldJobs.has(id))).toBe(
    true,
  );
  await profile.getByRole("button", { name: "Simulator", exact: true }).click();
  await profile
    .getByRole("button", { name: "Check environment", exact: true })
    .click();
  await expect(
    profile.getByText(/Capabilities checked with small simulator circuits/),
  ).toBeVisible();
  const checked = await get("/api/execution-profile");
  expect(checked.revision).toBe(old.revision);
  expect(
    checked.capabilities.devices
      .find(({ id }) => id === "cpu")
      .methods.find(({ id }) => id === "statevector").available,
  ).toBe(true);
  const method = profile.getByRole("combobox", { name: "Simulation method" });
  await method.selectOption("statevector");
  await profile.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(profile.getByText("Applied", { exact: true })).toBeVisible();
  const applied = await get("/api/execution-profile");
  expect(applied.revision).toBe(old.revision + 1);
  await run.click();
  let job;
  await expect
    .poll(async () => {
      const jobs = (await get("/api/jobs")).filter(
        ({ id }) => !oldJobs.has(id),
      );
      expect(jobs.length).toBeLessThanOrEqual(1);
      job = jobs[0];
      if (job?.status === "failed") throw new Error(job.error);
      return job?.status;
    })
    .toBe("completed");
  expect(job.result.execution_requested).toMatchObject({
    method: "statevector",
    device: "cpu",
  });
  expect(job.result.execution_actual).toMatchObject({
    method: "statevector",
    device: "cpu",
  });
  await expect(
    page.getByLabel("Recorded execution configuration"),
  ).toContainText("Actual");
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});
