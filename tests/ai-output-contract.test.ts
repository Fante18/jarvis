import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runSpecialist } from "../lib/server/analysis/provider";
import { RunBudget } from "../lib/analysis/policy";
import { sdkTransport } from "./helpers/analysis-transport";
import { expectOpenAICompatibleSchema } from "./helpers/openai-contract";
import { stageOutputSchema } from "../lib/analysis/contracts";
import { fixtureOutput } from "./fixtures/analysis";
import { openAIOutput } from "../lib/server/ai-output";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("sends a supported strict response schema in the actual Scout SDK HTTP request", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  const transport = sdkTransport();
  await runSpecialist({
    role: "scout",
    request: { topic: "Public accounting workflow research", notes: "", budget_cents: 150, include_sales: false },
    previous: [], sources: [], signal: AbortSignal.timeout(5000),
    budget: new RunBudget(1500000, 9), beforeCall: async () => {},
  });
  const body = JSON.parse(String(transport.mock.mock.calls[0][1]?.body));
  expect(body.text.format.strict).toBe(true);
  expectOpenAICompatibleSchema(body.text.format.schema);
});

it("keeps URL validity, HTTPS and text length validation on generated responses", () => {
  openAIOutput(stageOutputSchema);
  const output = fixtureOutput("scout");
  for (const url of ["https://", "http://example.com", "javascript:alert(1)"])
    expect(stageOutputSchema.safeParse({ ...output, claims: [{ ...output.claims[0], source_urls: [url] }] }).success).toBe(false);
  expect(stageOutputSchema.safeParse({ ...output, summary: "a".repeat(1201) }).success).toBe(false);
});
