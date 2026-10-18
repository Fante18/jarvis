import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { calibration, controlsSchema, cashSchema } from "../lib/automation";
import { authorizeCron } from "../lib/server/automation/service";
import { encrypt, decrypt, rawMessage, equal } from "../lib/server/gmail";
import { draftHash } from "../lib/server/sales";
afterEach(() => vi.unstubAllEnvs());
describe("safe autonomous operation boundaries", () => {
  it("ignores small and inconclusive samples and bounds all outcome adjustments", () => {
    expect(
      calibration([{ verdict: "supported" }, { verdict: "inconclusive" }])
        .adjustment,
    ).toBe(0);
    expect(
      calibration(Array.from({ length: 5 }, () => ({ verdict: "refuted" }))),
    ).toMatchObject({ samples: 5, adjustment: -10 });
    expect(
      calibration(Array.from({ length: 5 }, () => ({ verdict: "supported" })))
        .adjustment,
    ).toBe(10);
    expect(
      controlsSchema.safeParse({
        enabled: true,
        daily_limit_cents: 500,
        monthly_limit_cents: 200,
      }).success,
    ).toBe(false);
  });
  it("requires the configured cron bearer, including equal-length mismatch protection", () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(40));
    expect(() => authorizeCron(null)).toThrow();
    expect(() => authorizeCron(`Bearer ${"y".repeat(40)}`)).toThrow();
    expect(() => authorizeCron(`Bearer ${"x".repeat(40)}`)).not.toThrow();
    vi.stubEnv("CRON_SECRET", "");
    expect(() => authorizeCron("Bearer undefined")).toThrow();
  });
  it("encrypts tokens with authenticated encryption and rejects tampering", () => {
    vi.stubEnv("EMAIL_ENCRYPTION_KEY", Buffer.alloc(32, 41).toString("base64"));
    const secret = {
      access_token: "private-test-access",
      refresh_token: "private-test-refresh",
    };
    const saved = encrypt(secret);
    expect(saved).not.toContain(secret.access_token);
    expect(decrypt(saved)).toEqual(secret);
    expect(encrypt(secret)).not.toBe(saved);
    const parts = saved.split(".");
    parts[2] = Buffer.from("forged").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(equal("abc", "abc")).toBe(true);
    expect(equal("abc", "abcd")).toBe(false);
  });
  it("binds reviews to exact content and prevents MIME header injection", () => {
    expect(draftHash("a@example.com", "Subject", "Body")).not.toBe(
      draftHash("b@example.com", "Subject", "Body"),
    );
    expect(() =>
      rawMessage(
        "me@example.com",
        "a@example.com",
        "Hi\r\nBcc: evil@example.com",
        "message",
      ),
    ).toThrow();
    const mime = Buffer.from(
      rawMessage(
        "me@example.com",
        "a@example.com",
        "Hej världen",
        "Återkoppling",
      ),
      "base64url",
    ).toString();
    expect(mime).toContain("To: a@example.com");
    expect(mime).toContain("Content-Transfer-Encoding: base64");
  });
  it("requires integer minor units and an explicit idempotency identifier for actual outcomes", () => {
    const base = {
      id: crypto.randomUUID(),
      lead_id: null,
      opportunity_id: null,
      kind: "receipt",
      amount_cents: 101,
      occurred_on: "2026-10-18",
      reference: "INV-test",
      evidence_url: "",
    };
    expect(cashSchema.safeParse(base).success).toBe(true);
    expect(cashSchema.safeParse({ ...base, amount_cents: 1.1 }).success).toBe(
      false,
    );
    expect(cashSchema.safeParse({ ...base, amount_cents: -50 }).success).toBe(
      false,
    );
  });
});
