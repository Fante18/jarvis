import { test, expect } from "@playwright/test";
import { fixtureJob, fixtureOutput, sources } from "../fixtures/analysis";
import {
  calculateFinance,
  checkClaims,
  finalReport,
  planAnalysis,
} from "../../lib/analysis/policy";
import { emptyWorkspace } from "../../lib/domain";
import type { StageResult } from "../../lib/analysis/contracts";
test("saved analysis renders score, assumptions, source provenance and all specialist history", async ({
  page,
}) => {
  const job = fixtureJob();
  job.results = planAnalysis(job).map((role) => {
    const output = fixtureOutput(role);
    return {
      role,
      output,
      claims: checkClaims(output, sources),
      sources,
      input_tokens: 100,
      output_tokens: 100,
      cost_microusd: 200,
      reserved_microusd: 500000,
      scenarios:
        role === "finance"
          ? calculateFinance(output.financial_assumptions!)
          : [],
      completed_at: job.created_at,
    } as StageResult;
  });
  job.report = finalReport(job.results);
  job.status = "completed";
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: { supabase: true, openai: true, model: "gpt-4.1-mini" },
    }),
  );
  await page.route("**/api/workspace", (r) =>
    r.fulfill({
      json: {
        data: emptyWorkspace(),
        user: { id: "test", email: "test@example.com" },
        settings: {
          workspace_name: "Test workspace",
          focus_sectors: "Accounting",
          currency: "SEK",
        },
      },
    }),
  );
  await page.route("**/api/ai/analyses", (r) =>
    r.fulfill({
      json: { analyses: [{ ...job, step_count: job.results.length }] },
    }),
  );
  await page.route(`**/api/ai/analyses/${job.id}`, (r) =>
    r.fulfill({ json: { analysis: job } }),
  );
  await page.goto(`/chat?analysis_id=${job.id}`);

  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".analysis-score > strong")).toHaveText("74/100");
  await expect(
    dialog.getByText("Rekommendation: Validera först"),
  ).toBeVisible();
  await expect(
    dialog.getByText("Betalningsvilja: ej empiriskt validerad.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(dialog.locator(".analysis-step")).toHaveCount(7);
  await dialog.locator(".analysis-step").first().locator("summary").click();
  await expect(
    dialog.getByText("Hypotes", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    dialog.getByText("Källcitat verifierat", { exact: true }).first(),
  ).toBeVisible();
  await expect(dialog.locator(".analysis-source")).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/jarvis-analysis-report.png",
    fullPage: true,
  });
});
