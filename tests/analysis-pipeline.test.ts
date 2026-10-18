import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { sdkTransport } from "./helpers/analysis-transport";
import {
  executeAnalysis,
  type AnalysisStore,
} from "../lib/server/analysis/orchestrator";
import { fixtureJob, fixtureOutput, sources } from "./fixtures/analysis";
import {
  specialists,
  type AgentRole,
  type AnalysisJob,
} from "../lib/analysis/contracts";
function memory(job: AnalysisJob): AnalysisStore {
  return {
    async claim() {
      job.status = "running";
      return structuredClone(job);
    },
    async reserve(_id, role, b) {
      job.active_role = role;
      job.spent_microusd = b.spent;
      job.reserved_microusd = b.reserved;
      job.attempted_calls = b.calls;
    },
    async checkpoint(_id, _position, result, b) {
      job.results.push(result);
      job.spent_microusd = b.spent;
      job.reserved_microusd = b.reserved;
    },
    async cancelled() {
      return job.cancel_requested;
    },
    async complete(_id, report, b) {
      job.status = "completed";
      job.report = report;
      job.spent_microusd = b.spent;
      job.reserved_microusd = b.reserved;
    },
    async fail(_id, status, error, b) {
      job.status = status;
      job.error = error;
      job.spent_microusd = b.spent;
      job.reserved_microusd = b.reserved;
      job.attempted_calls = b.calls;
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("complete Scout → Jarvis workflow with actual SDK and simulated provider", () => {
  it("coordinates all seven stages, verifies claims, computes finance and returns the scored analysis", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const t = sdkTransport();
    const job = fixtureJob();
    await executeAnalysis(job.id, {
      store: memory(job),
      loadSignals: async () => sources,
    });
    expect(t.calls).toEqual([
      "scout",
      "research",
      "validator",
      "strategist",
      "finance",
      "critic",
      "jarvis",
    ]);
    expect(job.status).toBe("completed");
    expect(job.results).toHaveLength(7);
    expect(job.report?.scorecard.total).toBe(74);
    expect(job.report?.payment_validation).toBe("untested");
    expect(job.report?.validation_tests).toHaveLength(1);
    expect(job.report?.scenarios[1].monthly_profit_sek).toBe(4000);
    expect(job.results.every((r) => r.claims[1].kind === "hypothesis")).toBe(
      true,
    );
    expect(job.spent_microusd).toBeLessThan(job.budget_cents * 10000);
    expect(job.reserved_microusd).toBe(0);
  });
  it("runs Sales before Critic only if explicitly selected, with no sending tools", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const t = sdkTransport();
    const job = { ...fixtureJob(), include_sales: true };
    await executeAnalysis(job.id, {
      store: memory(job),
      loadSignals: async () => sources,
    });
    expect(t.calls).toEqual([
      "scout",
      "research",
      "validator",
      "strategist",
      "finance",
      "sales",
      "critic",
      "jarvis",
    ]);
    expect(job.status).toBe("completed");
  });
  it("keeps completed checkpoints and reserves possible charges on error, then resumes without rerunning Scout", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const first = sdkTransport("research");
    const job = fixtureJob();
    const store = memory(job);
    await executeAnalysis(job.id, { store, loadSignals: async () => sources });
    expect(job.status).toBe("failed");
    expect(job.results.map((r) => r.role)).toEqual(["scout"]);
    expect(job.reserved_microusd).toBe(500000);
    const second = sdkTransport();
    await executeAnalysis(job.id, { store });
    expect(second.calls[0]).toBe("research");
    expect(second.calls).not.toContain("scout");
    expect(job.status).toBe("completed");
    expect(job.reserved_microusd).toBe(500000);
    expect(first.mock).toHaveBeenCalledTimes(2);
  });
  it("refuses provider calls when the next reservation would exceed the run cap", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const t = sdkTransport();
    const job = { ...fixtureJob(), spent_microusd: 1100000 };
    await executeAnalysis(job.id, {
      store: memory(job),
      loadSignals: async () => sources,
    });
    expect(job.status).toBe("budget_exceeded");
    expect(t.calls).toHaveLength(0);
    expect(job.report).toBeNull();
  });
  it("honors cancellation before paid model calls", async () => {
    const job = { ...fixtureJob(), cancel_requested: true };
    const call = vi.fn();
    await executeAnalysis(job.id, {
      store: memory(job),
      loadSignals: async () => sources,
      runStage: call,
    });
    expect(job.status).toBe("cancelled");
    expect(call).not.toHaveBeenCalled();
  });
  it("persists the exact safe quota category through the actual SDK without retries or leaking raw error data", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const privateMessage = "private-provider-message-must-not-be-saved";
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: {
      message: privateMessage, type: "insufficient_quota", code: "insufficient_quota", param: null,
    } }), { status: 429, headers: { "Content-Type": "application/json", "x-request-id": "req_quota_test" } }));
    vi.stubGlobal("fetch", fetch);
    const job = fixtureJob();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await executeAnalysis(job.id, { store: memory(job), loadSignals: async () => [] });
      expect(job.status).toBe("failed");
      expect(job.error).toContain("insufficient_quota");
      expect(job.error).toContain("Billing");
      expect(job.error).not.toContain(privateMessage);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateMessage);
      expect(job.reserved_microusd).toBe(500000);
      expect(job.results).toHaveLength(0);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
  it("never marks a failed or aborted stage as a complete report", async () => {
    const job = fixtureJob();
    await executeAnalysis(job.id, {
      store: memory(job),
      loadSignals: async () => sources,
      runStage: async () => {
        throw new DOMException("Stage timeout", "TimeoutError");
      },
    });
    expect(job.status).toBe("failed");
    expect(job.report).toBeNull();
    expect(job.results).toHaveLength(0);
  });
});
