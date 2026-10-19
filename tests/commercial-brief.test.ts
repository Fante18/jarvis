import { describe, expect, it } from "vitest";
import {
  calculateFinance,
  checkClaims,
  finalReport,
  planAnalysis,
} from "../lib/analysis/policy";
import { fixtureOutput, sources } from "./fixtures/analysis";
import type { StageResult } from "../lib/analysis/contracts";
function stages(sales = false): StageResult[] {
  return planAnalysis({ include_sales: sales }).map((role) => {
    const output = fixtureOutput(role);
    return {
      role,
      output,
      claims: checkClaims(output, sources),
      sources,
      input_tokens: 100,
      output_tokens: 100,
      cost_microusd: 200,
      reserved_microusd: 0,
      scenarios:
        role === "finance"
          ? calculateFinance(output.financial_assumptions!)
          : [],
      completed_at: "2026-10-18T12:00:00Z",
    };
  });
}
describe("autonomous commercial preparation", () => {
  it("prepares a reviewable offer and measurable test from existing stages without inventing a customer", () => {
    const results = stages(),
      report = finalReport(results),
      brief = report.commercial_brief!;
    expect(brief.status).toBe("review");
    expect(brief.monthly_price_hypothesis_sek).toBe(1000);
    expect(brief.validation_test?.stop_criterion).toBe("No willingness to pay");
    expect(brief.verified_quotes).toBe(1); // Repeated quote is counted once; fabricated paid customers never count.
    expect(brief.contact_draft_origin).toBe("template");
    expect(brief.contact_draft).not.toMatch(/100 customers|@/);
    expect(brief.blockers.join(" ")).toContain("Ingen kundlösning har byggts");
    expect(report.payment_validation).toBe("untested");
    expect(results).toHaveLength(7);
  });
  it("honors Critic rejection even when Jarvis suggests a test", () => {
    const results = stages();
    results.find((r) => r.role === "critic")!.output.recommendation = "reject";
    expect(finalReport(results).commercial_brief?.status).toBe("stop");
  });
  it("withholds the sales review when sources, economic viability or the validation test are missing", () => {
    for (const change of [
      (r: StageResult[]) => {
        for (const s of r) s.sources = [sources[0]];
      },
      (r: StageResult[]) => {
        r.find((s) => s.role === "finance")!.scenarios[1].monthly_profit_sek =
          -1;
      },
      (r: StageResult[]) => {
        r.find((s) => s.role === "validator")!.output.validation_tests = [];
      },
      (r: StageResult[]) => {
        r.find((s) => s.role === "jarvis")!.output.recommendation =
          "insufficient_evidence";
      },
    ]) {
      const results = stages();
      change(results);
      expect(finalReport(results).commercial_brief?.status).toBe("research");
    }
  });
  it("reuses a real saved Sales stage as an unsent draft when that stage was requested", () => {
    const results = stages(true),
      brief = finalReport(results).commercial_brief!;
    expect(brief.contact_draft_origin).toBe("sales_agent");
    expect(brief.contact_draft).toBe(
      results.find((s) => s.role === "sales")!.output.contact_draft,
    );
  });
  it("withholds an expensive implementation pilot without rewriting its original cost", () => {
    const results = stages();
    const test = results.find((s) => s.role === "validator")!.output
      .validation_tests[0];
    test.estimated_cost_sek = 50000;
    test.days = 90;
    const report = finalReport(results);
    expect(report.commercial_brief?.status).toBe("research");
    expect(report.commercial_brief?.blockers.join(" ")).toContain(
      "500 SEK och 14 dagar",
    );
    expect(report.commercial_brief?.validation_test?.estimated_cost_sek).toBe(
      50000,
    );
    expect(test.estimated_cost_sek).toBe(50000);
  });
  it("selects an existing small test while preserving all original research proposals", () => {
    const results = stages();
    const tests = results.find((s) => s.role === "validator")!.output
      .validation_tests;
    tests[0].estimated_cost_sek = 50000;
    tests[0].days = 90;
    tests.push({
      ...tests[0],
      test: "Five voluntary problem interviews",
      estimated_cost_sek: 0,
      days: 7,
    });
    const report = finalReport(results);
    expect(report.commercial_brief?.status).toBe("review");
    expect(report.commercial_brief?.validation_test?.test).toBe(
      "Five voluntary problem interviews",
    );
    expect(report.validation_tests[0].estimated_cost_sek).toBe(50000);
    expect(report.validation_tests).toHaveLength(2);
  });
  it("keeps genuine low scores on the original scale instead of automatically multiplying them", () => {
    const results = stages();
    const dimensions = results.find((s) => s.role === "jarvis")!.output
      .dimensions!;
    for (const dimension of Object.values(dimensions)) dimension.score = 6;
    const report = finalReport(results);
    expect(report.scorecard.total).toBe(6);
    expect(report.commercial_brief?.status).toBe("research");
  });
});
