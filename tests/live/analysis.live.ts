import { test, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import { executeAnalysis } from "../../lib/server/analysis/orchestrator";
import { analysisStore } from "../../lib/server/analysis/store";
import { reserveAI } from "../../lib/server/ai";
// Explicit opt-in command only. Real provider calls, real account, real bill, real records.
test("real Scout-to-Jarvis analysis persists in the configured Supabase test account", async () => {
  for (const name of [
    "OPENAI_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "JARVIS_TEST_EMAIL",
    "JARVIS_TEST_PASSWORD",
  ])
    if (!process.env[name])
      throw new Error(
        `LIVE TEST BLOCKED: ${name} saknas. Konfigurera den säkert; inga testresultat simuleras.`,
      );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await db.auth.signInWithPassword({
    email: process.env.JARVIS_TEST_EMAIL!,
    password: process.env.JARVIS_TEST_PASSWORD!,
  });
  expect(login.error?.message).toBeUndefined();
  const user = login.data.user!;
  await reserveAI(db);
  const created = await db
    .from("analysis_jobs")
    .insert({
      user_id: user.id,
      topic: "AI automation opportunities for small accounting firms",
      notes:
        "Live integration check. Do not invent customers or measured revenue.",
      budget_cents: 150,
      include_sales: false,
      lease_until: new Date(Date.now() + 300000).toISOString(),
    })
    .select("id")
    .single();
  expect(created.error?.message).toBeUndefined();
  const id = created.data!.id;
  await executeAnalysis(id, { store: analysisStore(db, user.id) });
  const result = await db
    .from("analysis_jobs")
    .select("*")
    .eq("id", id)
    .single();
  expect(result.error?.message).toBeUndefined();
  expect(result.data.status, result.data.error || "").toBe("completed");
  expect(result.data.results.map((r: { role: string }) => r.role)).toEqual([
    "scout",
    "research",
    "validator",
    "strategist",
    "finance",
    "critic",
    "jarvis",
  ]);
  expect(result.data.report.source_count).toBeGreaterThan(0);
  expect(result.data.report.payment_validation).toBe("untested");
  expect(
    result.data.spent_microusd + result.data.reserved_microusd,
  ).toBeLessThanOrEqual(1500000);
  const steps = await db
    .from("analysis_steps")
    .select("id")
    .eq("analysis_id", id);
  expect(steps.data).toHaveLength(7);
  console.log(
    JSON.stringify({
      live_analysis_id: id,
      status: result.data.status,
      sources: result.data.report.source_count,
      cost_microusd: result.data.spent_microusd,
    }),
  );
  await db.auth.signOut();
});
