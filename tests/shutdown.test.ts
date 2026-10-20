import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { proxy } from "../proxy";
import { aiClient, requireAI } from "../lib/server/ai";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("returns a closed response before the application can contact external services", async () => {
  const network = vi.fn(() => {
    throw new Error("Unexpected network request");
  });
  vi.stubGlobal("fetch", network);
  const response = proxy();
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: "JARVIS är avstängt." });
  expect(network).not.toHaveBeenCalled();
});
it("blocks OpenAI client construction even when a key remains configured", () => {
  vi.stubEnv("OPENAI_API_KEY", "shutdown-test-fixture");
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  expect(requireAI).toThrow("JARVIS är avstängt.");
  expect(aiClient).toThrow("JARVIS är avstängt.");
  expect(network).not.toHaveBeenCalled();
});
