import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  serverSupabaseKey,
  validCronSecret,
  workerConfiguration,
} from "../lib/server-configuration.mjs";
import { workerReadiness } from "../lib/server/automation/service";

// Deliberately unsigned fixtures: local validation is not proof of authentication.
const legacy = (role: string) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.unsigned-test-signature`;
function env(key = "sb_secret_config-test-fixture") {
  const values = {
    SUPABASE_SECRET_KEY: key,
    NEXT_PUBLIC_SUPABASE_URL: "https://config-check.supabase.co",
    CRON_SECRET: "cron-test-fixture-".repeat(3),
    OPENAI_API_KEY: "openai-test-fixture",
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  return values;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("server configuration without credential disclosure", () => {
  it("accepts modern and legacy service keys, including harmless outer whitespace", () => {
    expect(serverSupabaseKey("  sb_secret_test-fixture\n")).toBe(
      "sb_secret_test-fixture",
    );
    expect(serverSupabaseKey(` ${legacy("service_role")} `)).toBe(
      legacy("service_role"),
    );
    for (const key of [
      "sb_publishable_fixture",
      legacy("anon"),
      legacy("authenticated"),
      "not-a-key",
      "e30.not-json.signature",
      '"sb_secret_quoted"',
    ])
      expect(serverSupabaseKey(key)).toBe("");
  });
  it("requires a long exact cron secret without silently trimming the scheduler credential", () => {
    expect(validCronSecret("x".repeat(32))).toBe(true);
    for (const value of [
      undefined,
      "",
      "x".repeat(31),
      ` ${"x".repeat(40)}`,
      `${"x".repeat(40)}\n`,
      "x".repeat(35) + "\ny",
    ])
      expect(validCronSecret(value)).toBe(false);
  });
  it("identifies each bad setting using only static messages and variable names", () => {
    const values = env();
    const result = workerConfiguration({
      ...values,
      CRON_SECRET: "short-test",
    });
    expect(result).toMatchObject({
      configured: false,
      issues: [{ variable: "CRON_SECRET", code: "too_short" }],
    });
    const output = JSON.stringify(result);
    for (const value of [...Object.values(values), "short-test"])
      expect(output).not.toContain(value);
    expect(
      workerConfiguration({ ...values, CRON_SECRET: ` ${values.CRON_SECRET}` })
        .issues[0].code,
    ).toBe("whitespace");
    expect(
      workerConfiguration({
        ...values,
        NEXT_PUBLIC_SUPABASE_URL: "https://user:password@example.com/path",
      }).issues[0].variable,
    ).toBe("NEXT_PUBLIC_SUPABASE_URL");
    expect(
      workerConfiguration({
        ...values,
        SUPABASE_SECRET_KEY: legacy("service_role"),
      }).configured,
    ).toBe(true);
  });
  it("verifies server access with an owner-scoped HEAD request and retrieves no rows", async () => {
    env(legacy("service_role"));
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await workerReadiness("test-owner");
    expect(result).toEqual({
      configured: true,
      issues: [],
      connection_verified: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const url = new URL(input);
    expect(url.pathname).toBe("/rest/v1/email_connections");
    expect(url.searchParams.get("select")).toBe("user_id");
    expect(url.searchParams.get("user_id")).toBe("eq.test-owner");
    expect(init.method).toBe("HEAD");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    await workerReadiness("another-owner");
    expect(fetcher).toHaveBeenCalledTimes(1); // Brief cache contains only connection status.
  });
  it("rejects provider authentication failure without returning provider text or key values", async () => {
    const values = env("sb_secret_rejected-test-fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: `private provider message ${values.SUPABASE_SECRET_KEY}`,
            }),
            { status: 401 },
          ),
      ),
    );
    const result = await workerReadiness("test-owner");
    expect(result).toMatchObject({
      configured: false,
      connection_verified: false,
      issues: [
        { variable: "SUPABASE_SECRET_KEY", code: "authentication_failed" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(values.SUPABASE_SECRET_KEY);
    expect(JSON.stringify(result)).not.toContain("private provider message");
  });
  it("does not attempt a connection with a public key in the server setting", async () => {
    env(legacy("anon"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await workerReadiness("test-owner");
    expect(result).toMatchObject({
      configured: false,
      issues: [{ variable: "SUPABASE_SECRET_KEY", code: "invalid_format" }],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
