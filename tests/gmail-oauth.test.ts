import { vi, it, expect, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const owner = "60000000-0000-4000-8000-000000000099";
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("../lib/server/http", async () => {
  const actual = await vi.importActual<object>("../lib/server/http");
  return {
    ...actual,
    requireUser: async () => ({ db: {}, user: { id: owner } }),
  };
});
import { POST as start } from "../app/api/integrations/gmail/start/route";
import { GET as callback } from "../app/api/integrations/gmail/callback/route";
import { encrypt, decrypt } from "../lib/server/gmail";
function env() {
  vi.stubEnv("APP_URL", "https://jarvis.example");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "not-a-real-client-secret");
  vi.stubEnv("SUPABASE_SECRET_KEY", "not-a-real-server-key");
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64"));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("starts OAuth with fixed send-only scopes, PKCE and a short-lived HttpOnly user-bound state", async () => {
  env();
  const r = await start(
    new Request("https://jarvis.example/api/integrations/gmail/start", {
      method: "POST",
      headers: { origin: "https://jarvis.example" },
    }),
  );
  expect(r.status).toBe(200);
  const url = new URL((await r.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("scope")).toBe(
    "openid email https://www.googleapis.com/auth/gmail.send",
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  const [name, cookie, options] = jar.set.mock.calls[0];
  expect(name).toBe("jarvis.gmail.state");
  expect(options).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
  });
  const state = decrypt(cookie);
  expect(state.user_id).toBe(owner);
  expect(state.state).toBe(url.searchParams.get("state"));
  expect(state.verifier).toHaveLength(64);
});
it("rejects mismatched state, another account and expired callbacks before exchanging a token", async () => {
  env();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const partial of [
    { state: "wrong" },
    { user_id: "60000000-0000-4000-8000-000000000088" },
    { expires_at: Date.now() - 1 },
  ]) {
    jar.get.mockReturnValue({
      value: encrypt({
        state: "expected",
        user_id: owner,
        verifier: "private-verifier",
        expires_at: Date.now() + 10000,
        ...partial,
      }),
    });
    const r = await callback(
      new Request(
        "https://jarvis.example/api/integrations/gmail/callback?state=expected&code=not-a-real-code",
      ),
    );
    expect(r.headers.get("location")).toBe(
      "https://jarvis.example/settings?gmail=error",
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});
