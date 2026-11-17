import { test, expect } from "@playwright/test";

test("a saved return value opens by default when it is the only result", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep this unsaved model\nprint('retain')\n";
  await editor.fill(draft);

  const submitted = await page.request.post("/api/python/runs", {
    data: {
      name: "Save return values",
      source: `from dataclasses import replace
import torch
import flagquantum as fq
state = fq.run(fq.Circuit(1).h(0))
with_value = replace(state, value=torch.tensor([0.625]))
fq.save("state-and-value.fqx", state.plan, result=with_value)
value_only = replace(with_value, state=None, samples=None, measurements=())
fq.save("value-only.fqx", state.plan, result=value_only)
`,
    },
  });
  expect(submitted.ok()).toBeTruthy();
  const { id } = await submitted.json();
  let run;
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/python/runs/" + id);
      expect(response.ok()).toBeTruthy();
      run = await response.json();
      return run.collection_status;
    })
    .toBe("completed");
  expect(run.status).toBe("completed");
  expect(run.experiments).toHaveLength(2);

  const jobsResponse = await page.request.get("/api/jobs");
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  async function openJob(filename) {
    const job = jobs.find((job) => job.experiment?.filename === filename);
    expect(job).toBeDefined();
    await page
      .getByRole("button", { name: "Open job " + job.name, exact: true })
      .click();
  }

  await page.reload();
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  const returnedValue = page
    .locator("details")
    .filter({ has: page.getByText("Returned value", { exact: true }) });

  await openJob("state-and-value.fqx");
  await expect(
    page.getByRole("region", { name: "Saved statevector probabilities" }),
  ).toBeVisible();
  await expect(returnedValue).not.toHaveAttribute("open", "");
  await expect(returnedValue.locator("pre")).toBeHidden();

  await openJob("value-only.fqx");
  await expect(returnedValue.locator("pre")).toBeVisible();
  await expect(returnedValue.locator("pre")).toContainText("0.625");
  await expect(page.getByText("No counts distribution")).toHaveCount(0);
  await returnedValue.locator("summary").click();
  await expect(returnedValue.locator("pre")).toBeHidden();
  await returnedValue.locator("summary").click();
  await expect(returnedValue.locator("pre")).toBeVisible();

  await page.reload();
  await expect(returnedValue.locator("pre")).toContainText("0.625");
  const runsResponse = await page.request.get("/api/python/runs");
  expect(runsResponse.ok()).toBeTruthy();
  expect((await runsResponse.json()).map((run) => run.id)).toEqual([id]);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});
