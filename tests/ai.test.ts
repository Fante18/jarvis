import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentRequestSchema,
  outputTokenLimit,
  reportSchema,
} from "../lib/ai-contract";
import { demoWorkspace } from "../lib/demo";
import { analyzeAgent, requireAI } from "../lib/server/ai";
import { expectOpenAICompatibleSchema } from "./helpers/openai-contract";
vi.mock("server-only", () => ({}));
const report = {
  summary: "Testad rapport med tydlig osäkerhet.",
  signals: [],
  opportunities: [],
  approvals: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("AI boundaries and real Agents SDK serialization", () => {
  it("requires server configuration instead of returning sample AI output", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => requireAI()).toThrow(/OPENAI_API_KEY/);
  });
  it("rejects invalid jobs, oversized reports, unsafe sources and injected statuses", () => {
    expect(
      agentRequestSchema.safeParse({ agent_id: "other", prompt: "x" }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...report, opportunities: Array(4).fill({}) })
        .success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...report,
        signals: [
          {
            title: "Test",
            description: "Test",
            sector: "AI",
            strength: "high",
            source_url: "javascript:alert(1)",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...report,
        approvals: [
          {
            title: "Test",
            description: "Test",
            risk: "low",
            action_type: "outreach",
            amount: 0,
            status: "approved",
          },
        ],
      }).success,
    ).toBe(false);
    expect(outputTokenLimit(100000)).toBeLessThanOrEqual(2400);
  });
  it("runs the actual SDK against mocked HTTP with privacy and tool limits", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-not-a-real-key");
    let sent: Record<string, unknown> = {};
    const mock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "resp_test",
          object: "response",
          created_at: 1,
          status: "completed",
          model: "gpt-4.1-mini",
          output: [
            {
              id: "msg_test",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(report),
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mock);
    const result = await analyzeAgent(
      demoWorkspace().agents[0],
      "Analysera en avgränsad marknad",
      '{"signals":[]}',
      new AbortController().signal,
    );
    expect(result.report.summary).toBe(report.summary);
    expect(result.tokens).toBe(150);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(sent.store).toBe(false);
    expect(sent.max_tool_calls).toBe(3);
    expect(sent.max_output_tokens).toBe(2400);
    expect(sent.tools).toEqual([
      expect.objectContaining({ type: "web_search" }),
    ]);
    expect(sent.text).toMatchObject({
      format: { type: "json_schema", strict: true },
    });
    expectOpenAICompatibleSchema((sent.text as { format: { schema: unknown } }).format.schema);
  });
  it("rejects a structurally invalid model response before persistence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-not-a-real-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "resp_bad",
              object: "response",
              created_at: 1,
              status: "completed",
              output: [
                {
                  id: "msg_bad",
                  type: "message",
                  status: "completed",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      text: '{"summary":"incomplete"}',
                      annotations: [],
                    },
                  ],
                },
              ],
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    await expect(
      analyzeAgent(
        demoWorkspace().agents[0],
        "Analysera en avgränsad marknad",
        "{}",
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});
