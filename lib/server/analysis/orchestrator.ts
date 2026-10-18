import "server-only";
import {
  analysisRequestSchema,
  type AnalysisJob,
  type StageResult,
  type Source,
  type FinalAnalysis,
  type AgentRole,
} from "@/lib/analysis/contracts";
import {
  BudgetExceeded,
  RunBudget,
  planAnalysis,
  finalReport,
  MAX_RUN_MS,
  MAX_STAGE_MS,
} from "@/lib/analysis/policy";
import { runSpecialist, publicSignals, type StageInput } from "./provider";
export interface AnalysisStore {
  claim(id: string): Promise<AnalysisJob>;
  checkpoint(
    id: string,
    position: number,
    result: StageResult,
    budget: RunBudget,
  ): Promise<void>;
  reserve(id: string, role: AgentRole, budget: RunBudget): Promise<void>;
  cancelled(id: string): Promise<boolean>;
  complete(id: string, report: FinalAnalysis, budget: RunBudget): Promise<void>;
  fail(
    id: string,
    status: "failed" | "budget_exceeded" | "cancelled",
    message: string,
    budget: RunBudget,
  ): Promise<void>;
}
export type PipelineDependencies = {
  store: AnalysisStore;
  runStage?: (input: StageInput) => Promise<StageResult>;
  loadSignals?: (topic: string, signal: AbortSignal) => Promise<Source[]>;
  signal?: AbortSignal;
};
export async function executeAnalysis(id: string, deps: PipelineDependencies) {
  const job = await deps.store.claim(id);
  const request = analysisRequestSchema.parse({
    topic: job.topic,
    notes: job.notes,
    budget_cents: job.budget_cents,
    include_sales: job.include_sales,
  });
  const plan = planAnalysis(request);
  const budget = new RunBudget(request.budget_cents * 10000, plan.length + 2);
  budget.spent = job.spent_microusd;
  budget.reserved = job.reserved_microusd;
  budget.calls = job.attempted_calls || job.results.length;
  const results = [...job.results];
  const timeout = AbortSignal.timeout(MAX_RUN_MS);
  const signal = deps.signal
    ? AbortSignal.any([timeout, deps.signal])
    : timeout;
  try {
    let sources = [
      ...new Map(
        results.flatMap((r) => r.sources).map((s) => [s.url, s]),
      ).values(),
    ];
    if (results.length === 0) {
      try {
        sources = await (deps.loadSignals || publicSignals)(
          request.topic,
          signal,
        );
      } catch {
        if (signal.aborted)
          throw signal.reason; /* Web research still runs; failed public feeds are not fabricated. */
      }
    }
    for (let i = results.length; i < plan.length; i++) {
      if (signal.aborted) throw signal.reason;
      if (await deps.store.cancelled(id)) {
        await deps.store.fail(
          id,
          "cancelled",
          "Avbruten på användarens begäran. Inga ytterligare anrop görs.",
          budget,
        );
        return;
      }
      const result = await (deps.runStage || runSpecialist)({
        role: plan[i],
        request,
        privateContext: job.private_context,
        previous: results,
        sources,
        signal: AbortSignal.any([signal, AbortSignal.timeout(MAX_STAGE_MS)]),
        budget,
        beforeCall: async () => deps.store.reserve(id, plan[i], budget),
      });
      // Never publish a report as complete unless every mandatory stage exists and is in order.
      if (result.role !== plan[i])
        throw new Error("Fel agentresultat i analyskedjan.");
      await deps.store.checkpoint(id, i, result, budget);
      results.push(result);
      sources = [
        ...new Map(
          [...sources, ...result.sources].map((s) => [s.url, s]),
        ).values(),
      ];
    }
    if (await deps.store.cancelled(id)) {
      await deps.store.fail(
        id,
        "cancelled",
        "Avbruten före sammanställning.",
        budget,
      );
      return;
    }
    await deps.store.complete(id, finalReport(results), budget);
  } catch (e) {
    const status = e instanceof BudgetExceeded ? "budget_exceeded" : "failed";
    const message =
      e instanceof BudgetExceeded
        ? e.message
        : signal.aborted ||
            (e instanceof Error &&
              ["TimeoutError", "AbortError"].includes(e.name))
          ? "Tidsgränsen för körningen uppnåddes. Sparade steg finns kvar."
          : "Agentsteget kunde inte slutföras. Kontrollera API-behörighet, kvot och uppdrag. Sparade steg finns kvar.";
    await deps.store.fail(id, status, message, budget);
  }
}
