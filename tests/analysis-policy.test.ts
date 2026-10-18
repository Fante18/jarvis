import { describe, it, expect } from "vitest";
import {
  RunBudget,
  BudgetExceeded,
  calculateFinance,
  checkClaims,
  scoreAnalysis,
  planAnalysis,
  maximumCallCost,
} from "../lib/analysis/policy";
import { fixtureOutput, sources } from "./fixtures/analysis";
import { extractWebSources } from "../lib/server/analysis/provider";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("analysis integrity", () => {
  it("plans mandatory stages and only adds Sales when requested", () => {
    expect(planAnalysis({ include_sales: false })).toEqual([
      "scout",
      "research",
      "validator",
      "strategist",
      "finance",
      "critic",
      "jarvis",
    ]);
    expect(planAnalysis({ include_sales: true })).toEqual([
      "scout",
      "research",
      "validator",
      "strategist",
      "finance",
      "sales",
      "critic",
      "jarvis",
    ]);
  });
  it("does not accept a real quote as proof of a fabricated claim", () => {
    const claims = checkClaims(fixtureOutput("research"), sources);
    expect(claims[0].kind).toBe("fact");
    expect(claims[0].verification).toBe("source_quote");
    expect(claims[1].kind).toBe("hypothesis");
    expect(claims[1].verification).toBe("unverified");
  });
  it("rejects nonexistent source URLs as verified facts", () => {
    const o = fixtureOutput("scout");
    o.claims[0].source_urls = ["https://fabricated.invalid"];
    expect(checkClaims(o, sources)[0].source_urls).toEqual([]);
    expect(checkClaims(o, sources)[0].kind).toBe("hypothesis");
  });
  it("computes revenue, margin, break-even and cost in code", () => {
    const base = calculateFinance(
      fixtureOutput("finance").financial_assumptions!,
    )[1];
    expect(base).toMatchObject({
      customers: 10,
      monthly_revenue_sek: 10000,
      monthly_profit_sek: 4000,
      gross_margin_percent: 90,
      breakeven_customers: 6,
      acquisition_spend_sek: 2000,
      initial_cash_needed_sek: 9000,
    });
  });
  it("handles zero revenue and negative unit margin without invented break-even", () => {
    const a = fixtureOutput("finance").financial_assumptions!;
    const zero = calculateFinance({
      ...a,
      price_sek: 0,
      assumed_customers: 0,
    })[1];
    expect(zero.gross_margin_percent).toBeNull();
    expect(zero.breakeven_customers).toBeNull();
    expect(zero.monthly_profit_sek).toBe(-5000);
  });
  it("caps scores when evidence and payment validation are missing", () => {
    const score = scoreAnalysis(fixtureOutput("jarvis"), []);
    expect(score.total).toBe(40);
    expect(score.dimensions.demand.score).toBe(40);
    expect(Object.values(score.weights).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("reserves maximum cost before making calls and retains ambiguous charges", () => {
    const budget = new RunBudget(600000, 2);
    budget.reserve(maximumCallCost(1000, true));
    expect(() => budget.reserve(200000)).toThrow(BudgetExceeded);
    expect(budget.reserved).toBe(500000);
    budget.settle(500000, 10000);
    budget.reserve(500000);
    expect(budget.spent + budget.reserved).toBe(510000);
    expect(() => budget.reserve(1)).toThrow(BudgetExceeded);
  });
  it("only extracts provider citations, never a model-generated URL in JSON text", () => {
    const result = extractWebSources({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"url":"https://fake.invalid"}',
              annotations: [
                {
                  type: "url_citation",
                  url: "https://real.example",
                  title: "Actual citation",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.map((s) => s.url)).toEqual(["https://real.example"]);
  });
});
