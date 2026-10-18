import type {
  AgentRole,
  StageOutput,
  AnalysisJob,
  Source,
} from "../../lib/analysis/contracts";
export const sources: Source[] = [
  {
    url: "https://news.ycombinator.com/item?id=123",
    title: "Test source one",
    excerpt:
      "This is a recorded public discussion about accounting administration.",
    provider: "hacker_news",
    retrieved_at: "2026-10-17T12:00:00Z",
  },
  {
    url: "https://news.ycombinator.com/item?id=456",
    title: "Test source two",
    excerpt:
      "A second independently retrieved discussion. No customers have paid.",
    provider: "hacker_news",
    retrieved_at: "2026-10-17T12:00:00Z",
  },
];
// Test fixtures only. Never imported by application code or shown as live analyses.
export function fixtureOutput(role: AgentRole): StageOutput {
  return {
    market_research:
      role === "research"
        ? {
            competitors: [],
            segments: ["Small accounting firms"],
            market_size: {
              kind: "unknown",
              text: "Unknown without independent evidence",
              source_urls: [],
              quote: "",
            },
            demand_evidence: "Public discussion is not payment validation",
          }
        : null,
    contact_draft:
      role === "sales"
        ? "Would you consider a paid pilot for this specific workflow? Please review this unsent draft."
        : null,
    summary: `${role}: isolated test analysis; no actual customers or measured revenue.`,
    opportunity: {
      title: "Accounting pilot hypothesis",
      problem: "Administrative friction hypothesis",
      audience: "Small accounting firms",
      offer: "A narrow paid pilot to validate",
    },
    claims: [
      {
        kind: "fact",
        statement: sources[0].excerpt,
        quote: sources[0].excerpt,
        source_urls: [sources[0].url],
      },
      {
        kind: "fact",
        statement: "100 customers have paid",
        quote: sources[0].excerpt,
        source_urls: [sources[0].url],
      },
    ],
    validation_tests:
      role === "validator"
        ? [
            {
              test: "Ask five firms to reserve a paid pilot",
              metric: "Actual paid reservations",
              pass_criterion: "Two payments",
              stop_criterion: "No willingness to pay",
              estimated_cost_sek: 500,
              days: 7,
            },
          ]
        : [],
    plan: ["Run a small validation test before investment"],
    risks: ["Willingness to pay remains untested"],
    financial_assumptions:
      role === "finance"
        ? {
            price_sek: 1000,
            variable_cost_sek: 100,
            fixed_cost_sek: 5000,
            acquisition_cost_sek: 200,
            assumed_customers: 10,
            startup_cost_sek: 2000,
            rationale: "Hypothetical assumptions for a sensitivity test",
          }
        : null,
    dimensions:
      role === "jarvis"
        ? {
            demand: { score: 90, reason: "Needs payment validation" },
            feasibility: { score: 80, reason: "Pilot feasibility assumption" },
            customer_access: { score: 80, reason: "Reach hypothesis" },
            economics: { score: 80, reason: "Scenario only" },
            risk: { score: 80, reason: "Risk assumption" },
          }
        : null,
    recommendation: "test",
  };
}
export function fixtureJob(): AnalysisJob {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    topic: "Accounting workflow opportunities",
    notes: "Private user context",
    budget_cents: 150,
    include_sales: false,
    status: "queued",
    active_role: null,
    results: [],
    report: null,
    spent_microusd: 0,
    reserved_microusd: 0,
    attempted_calls: 0,
    error: null,
    cancel_requested: false,
    created_at: "2026-10-17T12:00:00Z",
    updated_at: "2026-10-17T12:00:00Z",
    lease_until: null,
    opportunity_id: null,
  };
}
