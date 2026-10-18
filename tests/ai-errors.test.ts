import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import OpenAI from "openai";
import { diagnoseAIError } from "../lib/server/ai-errors";
import { friendlyAIError } from "../lib/server/ai";

describe("safe provider diagnostics", () => {
  it.each([
    [401, "invalid_api_key", "authentication"],
    [403, "insufficient_permissions", "permission"],
    [429, "insufficient_quota", "quota"],
    [429, "rate_limit_exceeded", "rate_limit"],
    [400, "invalid_json_schema", "schema"],
    [400, "unsupported_parameter", "request"],
    [404, "model_not_found", "model"],
    [500, undefined, "provider"],
  ] as const)("classifies HTTP %s / %s without exposing provider messages", (status, code, category) => {
    const privateMessage = "private-notes-and-credential-must-never-be-logged";
    const error = new OpenAI.APIError(status, { code, message: privateMessage }, privateMessage,
      new Headers({ "x-request-id": "req_diagnostic_test" }));
    const result = diagnoseAIError(error);
    expect(result.category).toBe(category);
    expect(result.status).toBe(status);
    expect(result.requestId).toBe("req_diagnostic_test");
    expect(JSON.stringify(result)).not.toContain(privateMessage);
    expect(friendlyAIError(error).message).toBe(result.message);
  });

  it("recognizes a schema parameter error even when the provider omits its error code", () => {
    const error = new OpenAI.APIError(400, { param: "text.format.schema", message: "raw contents" }, undefined, new Headers());
    expect(diagnoseAIError(error).category).toBe("schema");
  });

  it("does not echo arbitrary codes, request identifiers or unknown exception text", () => {
    const raw = "credential-and-private-data";
    const error = new OpenAI.APIError(400, { code: raw, message: raw }, raw,
      new Headers({ "x-request-id": raw }));
    expect(JSON.stringify(diagnoseAIError(error))).not.toContain(raw);
    expect(JSON.stringify(diagnoseAIError(new Error(raw)))).not.toContain(raw);
    expect(friendlyAIError(new DOMException(raw, "TimeoutError")).status).toBe(504);
  });
});
