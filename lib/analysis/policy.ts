import {
  dimensionKeys,
  type AnalysisRequest,
  type StageResult,
  type Source,
  type CheckedClaim,
  type StageOutput,
  type FinancialScenario,
  type Scorecard,
  type FinalAnalysis,
} from "./contracts";
export const MODEL = "gpt-4.1-mini";
export const PRICING_VERSION =
  "gpt-4.1-mini-2025-04; input $0.40/M, output $1.60/M; web reserve $0.50/request";
export const MODEL_CONTEXT_LIMIT = 1047576;
export const MAX_OUTPUT_TOKENS = 2200;
export const MAX_STAGE_MS = 45000;
export const MAX_RUN_MS = 240000;
export function planAnalysis(request: Pick<AnalysisRequest, "include_sales">) {
  return [
    "scout",
    "research",
    "validator",
    "strategist",
    "finance",
    ...(request.include_sales ? ["sales"] : []),
    "critic",
    "jarvis",
  ] as StageResult["role"][];
}
export function tokenCost(input: number, output: number) {
  return Math.ceil((input * 4 + output * 16) / 10);
}
// UTF-8 bytes bound ordinary BPE tokens conservatively. Extra allowance covers SDK wrappers.
export function inputTokenBound(
  instructions: string,
  input: string,
  schema: unknown,
) {
  return (
    new TextEncoder().encode(instructions + input + JSON.stringify(schema))
      .length + 2048
  );
}
// Hosted search may add model-side context. Reserve the entire allowed context window,
// the maximum output and a web-tool allowance before such a call. No post-hoc-only cap.
export function maximumCallCost(inputBound: number, web: boolean) {
  return web ? 500000 : tokenCost(inputBound, MAX_OUTPUT_TOKENS);
}
export class BudgetExceeded extends Error {}
export class RunBudget {
  spent = 0;
  reserved = 0;
  calls = 0;
  constructor(
    readonly limit: number,
    readonly maxCalls: number,
  ) {}
  reserve(amount: number) {
    if (
      this.calls >= this.maxCalls ||
      this.spent + this.reserved + amount > this.limit
    )
      throw new BudgetExceeded(
        "Budgeten räcker inte för nästa säkert reserverade modellanrop.",
      );
    this.calls++;
    this.reserved += amount;
  }
  settle(reserved: number, actual: number) {
    if (actual > reserved)
      throw new BudgetExceeded(
        "Leverantörens användning överskred den reserverade prisramen. Inga fler anrop görs.",
      );
    this.reserved -= reserved;
    this.spent += actual;
  }
  // On an ambiguous timeout/error we retain the whole reservation: billing may have occurred.
}
export function checkClaims(
  output: StageOutput,
  sources: Source[],
): CheckedClaim[] {
  return output.claims.map((c) => {
    const matched = c.source_urls
      .map((url) => sources.find((s) => s.url === url))
      .filter((s): s is Source => Boolean(s));
    const quote = c.quote.trim();
    const verified =
      c.kind === "fact" &&
      matched.length > 0 &&
      quote.length >= 20 &&
      c.statement.trim() === quote &&
      matched.some((s) => s.excerpt.includes(quote));
    return {
      ...c,
      kind: c.kind === "fact" && !verified ? "hypothesis" : c.kind,
      source_urls: matched.map((s) => s.url),
      verification: verified ? "source_quote" : "unverified",
      warning:
        c.kind === "fact" && !verified
          ? "Ej verifierat: ingen ordagrann kontroll mot hämtat källutdrag."
          : verified
            ? "Citatet är verifierat mot hämtad källa; sakpåståendet är inte oberoende bekräftat."
            : null,
    };
  });
}
export function calculateFinance(
  a: NonNullable<StageOutput["financial_assumptions"]>,
): FinancialScenario[] {
  return [
    ["Försiktigt", 0.5],
    ["Basantagande", 1],
    ["Optimistiskt", 1.5],
  ].map(([name, mult]) => {
    const customers = Math.floor(a.assumed_customers * Number(mult)),
      revenue = customers * a.price_sek,
      variable = customers * a.variable_cost_sek,
      unit = a.price_sek - a.variable_cost_sek;
    return {
      name: String(name),
      customers,
      monthly_revenue_sek: revenue,
      monthly_variable_cost_sek: variable,
      monthly_profit_sek: revenue - variable - a.fixed_cost_sek,
      gross_margin_percent:
        revenue === 0 ? null : ((revenue - variable) / revenue) * 100,
      breakeven_customers:
        unit <= 0 ? null : Math.ceil(a.fixed_cost_sek / unit),
      acquisition_spend_sek: customers * a.acquisition_cost_sek,
      initial_cash_needed_sek:
        a.startup_cost_sek +
        customers * a.acquisition_cost_sek +
        a.fixed_cost_sek,
    };
  });
}
export function scoreAnalysis(
  output: StageOutput,
  results: StageResult[],
): Scorecard {
  if (!output.dimensions) throw new Error("Jarvis saknar poängdimensioner.");
  const dimensions = structuredClone(output.dimensions);
  const weights = {
    demand: 0.3,
    feasibility: 0.2,
    customer_access: 0.15,
    economics: 0.2,
    risk: 0.15,
  };
  const limitations = [
    "Poängen prioriterar fortsatt arbete; den är ingen framgångssannolikhet.",
    "Betalningsvilja är inte empiriskt validerad. Efterfrågan begränsas till 60/100.",
    "Hög riskpoäng betyder lägre bedömd risk.",
  ];
  dimensions.demand.score = Math.min(60, dimensions.demand.score);
  const sources = new Set(results.flatMap((r) => r.sources.map((s) => s.url)));
  if (sources.size < 2) {
    for (const k of dimensionKeys)
      dimensions[k].score = Math.min(40, dimensions[k].score);
    limitations.push(
      "Färre än två dokumenterade källor: samtliga dimensioner begränsas till 40.",
    );
  }
  const finance = results
    .find((r) => r.role === "finance")
    ?.scenarios.find((s) => s.name === "Basantagande");
  if (finance && finance.monthly_profit_sek <= 0) {
    dimensions.economics.score = Math.min(35, dimensions.economics.score);
    limitations.push(
      "Basscenariot är inte lönsamt: ekonomipoängen begränsas till 35.",
    );
  }
  return {
    dimensions,
    weights,
    total: Math.round(
      dimensionKeys.reduce(
        (sum, k) => sum + dimensions[k].score * weights[k],
        0,
      ),
    ),
    limitations,
  };
}
export function finalReport(results: StageResult[]): FinalAnalysis {
  const last = results.at(-1);
  if (last?.role !== "jarvis") throw new Error("Analysen är inte färdig.");
  const scout = results.find((r) => r.role === "scout")!,
    validator = results.find((r) => r.role === "validator")!,
    critic = results.find((r) => r.role === "critic")!;
  return {
    recommendation:
      new Set(results.flatMap((r) => r.sources.map((s) => s.url))).size < 2 &&
      last.output.recommendation !== "reject"
        ? "insufficient_evidence"
        : last.output.recommendation,
    summary: last.output.summary,
    opportunity: scout.output.opportunity,
    scorecard: scoreAnalysis(last.output, results),
    scenarios: results.find((r) => r.role === "finance")?.scenarios || [],
    validation_tests: validator.output.validation_tests,
    risks: [...new Set([...critic.output.risks, ...last.output.risks])],
    next_steps: last.output.plan,
    payment_validation: "untested",
    source_count: new Set(results.flatMap((r) => r.sources.map((s) => s.url)))
      .size,
    model: MODEL,
    pricing_version: PRICING_VERSION,
  };
}
