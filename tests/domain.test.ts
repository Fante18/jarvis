import { describe, expect, it } from "vitest";
import { demoWorkspace } from "../lib/demo";
import {
  assertEntity,
  emptyWorkspace,
  entitySchemas,
  metrics,
  mutationOriginAllowed,
  safeSourceUrl,
} from "../lib/domain";
describe("data boundaries", () => {
  it("rejects identity injection and out-of-range scores", () => {
    const sample = demoWorkspace().opportunities[0];
    const { id, created_at, ...payload } = sample;
    expect(entitySchemas.opportunities.safeParse(payload).success).toBe(true);
    expect(
      entitySchemas.opportunities.safeParse({ ...payload, user_id: "other" })
        .success,
    ).toBe(false);
    expect(
      entitySchemas.opportunities.safeParse({ ...payload, score: 101 }).success,
    ).toBe(false);
  });
  it("rejects automatic approval on create", () => {
    expect(
      entitySchemas.approvals.safeParse({
        title: "Test",
        description: "Test",
        risk: "low",
        status: "approved",
        action_type: "outreach",
        amount: 0,
      }).success,
    ).toBe(false);
  });
  it("only accepts known entity names", () => {
    expect(assertEntity("agents")).toBe(true);
    expect(assertEntity("__proto__")).toBe(false);
    expect(assertEntity("messages")).toBe(false);
  });
  it("blocks foreign and absent mutation origins", () => {
    expect(
      mutationOriginAllowed(
        "https://evil.example",
        "https://jarvis.example/api",
      ),
    ).toBe(false);
    expect(mutationOriginAllowed(null, "https://jarvis.example/api")).toBe(
      false,
    );
    expect(
      mutationOriginAllowed(
        "https://jarvis.example",
        "https://jarvis.example/api",
      ),
    ).toBe(true);
    expect(
      mutationOriginAllowed(
        "https://preview.example",
        "http://localhost/api",
        "https://jarvis.example",
      ),
    ).toBe(false);
  });
  it("rejects executable and non-https sources", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("http://example.com")).toBeNull();
    expect(safeSourceUrl("https://example.com")).toBe("https://example.com/");
  });
});
describe("financial reporting", () => {
  it("counts won revenue and excludes won/lost from pipeline", () => {
    const d = demoWorkspace();
    expect(metrics(d)).toMatchObject({
      revenue: 147000,
      pipeline: 215000,
      activeAgents: 3,
      opportunities: 4,
      conversion: 40,
    });
  });
  it("does not invent growth or conversion for an empty workspace", () => {
    expect(metrics(emptyWorkspace())).toEqual({
      revenue: 0,
      pipeline: 0,
      activeAgents: 0,
      opportunities: 0,
      conversion: 0,
    });
  });
});
