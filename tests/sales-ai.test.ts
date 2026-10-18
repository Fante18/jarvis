import { vi, it, expect, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProposal } from "../lib/server/sales";
import { expectOpenAICompatibleSchema } from "./helpers/openai-contract";
function database(events: string[], deny = false) {
  const rpc = vi.fn(async (name: string) => {
    events.push(name);
    if (name === "reserve_ai_request") return { data: true, error: null };
    if (name === "reserve_ai_cost")
      return deny
        ? { data: null, error: { message: "JARVIS_BUDGET_LIMIT" } }
        : { data: crypto.randomUUID(), error: null };
    return { data: null, error: null };
  });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        id: "lead",
        name: "Known person",
        company: "User provided AB",
        notes: "Known narrow need",
        opportunity_id: null,
      },
      error: null,
    }),
  };
  return { db: { rpc, from: () => query } as unknown as SupabaseClient, rpc };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("makes a real SDK request only after reservation, keeps sales research private and never enables send tools", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  const events: string[] = [];
  const { db, rpc } = database(events);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      events.push("provider");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-4.1-mini");
      expect(body.store).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.max_output_tokens).toBe(1800);
      expectOpenAICompatibleSchema(body.text.format.schema);
      expect(body.input).toContain("User provided AB");
      return new Response(
        JSON.stringify({
          id: "resp_sales",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_sales",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    subject: "A narrow pilot",
                    body: "A bounded proposal based on the provided facts. No promises.",
                  }),
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const proposal = await createProposal(
    db,
    "owner",
    "lead",
    "A bounded paid pilot with a clear scope",
    new AbortController().signal,
  );
  expect(proposal.subject).toBe("A narrow pilot");
  expect(events).toEqual([
    "reserve_ai_request",
    "reserve_ai_cost",
    "provider",
    "settle_ai_cost",
  ]);
  expect(rpc.mock.calls.at(-1)?.[0]).toBe("settle_ai_cost");
});
it("never calls OpenAI if the shared budget denies the proposal", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { db } = database([], true);
  await expect(
    createProposal(
      db,
      "owner",
      "lead",
      "A narrow offer",
      new AbortController().signal,
    ),
  ).rejects.toThrow(/budgeten/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("retains an ambiguous proposal reservation and does not retry automatically", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  const events: string[] = [];
  const { db, rpc } = database(events);
  const fetcher = vi.fn(async () => {
    throw new Error("connection lost");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    createProposal(
      db,
      "owner",
      "lead",
      "A narrow offer",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls.map((c) => c[0])).not.toContain("settle_ai_cost");
});
