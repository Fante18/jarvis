import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual, createHash } from "node:crypto";
import {
  serverSupabaseKey,
  validCronSecret,
  workerConfiguration,
} from "@/lib/server-configuration.mjs";
import { HttpError, dbCheck } from "../http";
import {
  defaultControls,
  calibration,
  type Digest,
  type Controls,
} from "@/lib/automation";
import type { AnalysisJob, Source } from "@/lib/analysis/contracts";
export type WorkerIssue = { variable: string; code: string; message: string };
export function serverDb() {
  const key = serverSupabaseKey(process.env.SUPABASE_SECRET_KEY);
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new HttpError(
      503,
      "Serveranslutningen är inte klar. Kontrollera SUPABASE_SECRET_KEY och NEXT_PUBLIC_SUPABASE_URL i Settings.",
    );
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
let connectionCache: {
  expires: number;
  fingerprint: string;
  issue: WorkerIssue | null;
} | null = null;
export async function workerReadiness(userId: string) {
  const config = workerConfiguration(process.env);
  const issues: WorkerIssue[] = [...config.issues];
  const canProbe = !issues.some((i) =>
    ["SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL"].includes(i.variable),
  );
  let connectionVerified = false;
  if (canProbe) {
    const fingerprint = createHash("sha256")
      .update(
        (process.env.SUPABASE_SECRET_KEY || "") +
          "|" +
          process.env.NEXT_PUBLIC_SUPABASE_URL,
      )
      .digest("hex");
    let issue: WorkerIssue | null;
    if (
      connectionCache &&
      connectionCache.expires > Date.now() &&
      connectionCache.fingerprint === fingerprint
    )
      issue = connectionCache.issue;
    else {
      try {
        // HEAD only: tests a server-only grant. Never retrieve encrypted tokens or email addresses.
        const result = await serverDb()
          .from("email_connections")
          .select("user_id", { head: true })
          .eq("user_id", userId)
          .limit(1)
          .abortSignal(AbortSignal.timeout(5000));
        issue = !result.error
          ? null
          : {
              variable: "SUPABASE_SECRET_KEY",
              code: [401, 403].includes(result.status)
                ? "authentication_failed"
                : "connection_failed",
              message: [401, 403].includes(result.status)
                ? "Supabase nekar servernyckeln. Kontrollera att SUPABASE_SECRET_KEY är en Secret/service_role-nyckel från samma projekt som NEXT_PUBLIC_SUPABASE_URL. Publicera om efter ändringen."
                : "Serveranslutningen till Supabase kunde inte verifieras. Kontrollera projektadress, servernyckel och installerade migrationer och försök igen.",
            };
      } catch {
        issue = {
          variable: "SUPABASE_SECRET_KEY",
          code: "connection_failed",
          message:
            "Tidsgränsen eller nätverket hindrade kontrollen av Supabase-serveranslutningen. Försök igen.",
        };
      }
      connectionCache = { expires: Date.now() + 30000, fingerprint, issue };
    }
    if (issue) issues.push(issue);
    else connectionVerified = true;
  }
  return {
    configured: issues.length === 0,
    issues,
    connection_verified: connectionVerified,
  };
}
export function authorizeCron(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!validCronSecret(secret))
    throw new HttpError(
      503,
      "Schemaläggaren saknar säker serverkonfiguration.",
    );
  const expected = Buffer.from(`Bearer ${secret!}`),
    actual = Buffer.from(header || "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new HttpError(401, "Ej tillåtet.");
}
export async function reserveCost(
  db: SupabaseClient,
  amount: number,
  kind: "chat" | "agent" | "proposal",
) {
  const r = await db.rpc("reserve_ai_cost", { p_amount: amount, p_kind: kind });
  if (r.error?.message.includes("JARVIS_BUDGET_LIMIT"))
    throw new HttpError(
      409,
      "Dags- eller månadsbudgeten räcker inte. Granska reservationer och budget i Settings.",
    );
  dbCheck(r.error);
  return r.data as string;
}
export async function settleCost(
  db: SupabaseClient,
  id: string,
  actual: number,
) {
  const r = await db.rpc("settle_ai_cost", { p_id: id, p_actual: actual });
  dbCheck(r.error);
}
export async function loadMemory(
  db: SupabaseClient,
  userId: string,
  job: AnalysisJob,
) {
  // Same owner, exact public topic, seven-day TTL. Original retrieval times are never refreshed by reuse.
  const r = await db
    .from("analysis_jobs")
    .select("id,results,report,opportunity_id")
    .eq("user_id", userId)
    .eq(
      "topic_key",
      job.topic
        .toLocaleLowerCase()
        .trim()
        .replace(/[^a-z0-9åäö]+/g, " "),
    )
    .neq("id", job.id)
    .eq("status", "completed")
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  dbCheck(r.error);
  const sources: Source[] = [
    ...new Map(
      (r.data || [])
        .flatMap((j) =>
          (j.results as AnalysisJob["results"]).flatMap((s) => s.sources),
        )
        .filter((s) => Date.parse(s.retrieved_at) > Date.now() - 7 * 86400000)
        .map((s) => [s.url, s]),
    ).values(),
  ].slice(0, 15);
  const feedback = await db
    .from("outcome_feedback")
    .select(
      "verdict,assumption,result,observed_at,test_reference,sample_size,positive_results",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  dbCheck(feedback.error);
  return {
    sources,
    public_context: JSON.stringify({
      previous_public_discoveries: (r.data || []).map(
        (j) => (j.results as AnalysisJob["results"])[0]?.output.opportunity,
      ),
      reuse_note:
        "Tidigare research, inte nya observationer. Kontrollera förändringar, aktualitet och motbevis. Återanvänd inte gamla slutsatser som verifierade fakta.",
    }).slice(0, 4500),
    private_context: JSON.stringify({
      measured_feedback: feedback.data,
      calibration: calibration(feedback.data || []),
    }).slice(0, 6500),
  };
}
export async function saveDigest(
  db: SupabaseClient,
  userId: string,
  force = false,
): Promise<Digest> {
  const day = new Date().toISOString().slice(0, 10),
    since = `${day}T00:00:00.000Z`;
  if (!force) {
    const cached = await db
      .from("daily_digests")
      .select("content")
      .eq("user_id", userId)
      .eq("day", day)
      .gte("updated_at", new Date(Date.now() - 30000).toISOString())
      .maybeSingle();
    dbCheck(cached.error);
    if (cached.data) return cached.data.content as Digest;
  }
  const [runs, approvals, followups] = await Promise.all([
    db
      .from("analysis_jobs")
      .select("id,status,opportunity_id,report,created_at,updated_at")
      .eq("user_id", userId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(100),
    db
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
    db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("stage", "in", "(won,lost)")
      .lte("next_action_at", new Date().toISOString()),
  ]);
  [runs, approvals, followups].forEach((r) => dbCheck(r.error));
  const completed = (runs.data || []).filter((j) => j.status === "completed");
  const findings: Digest["findings"] = [];
  for (const j of completed.slice(0, 20)) {
    if (
      !j.opportunity_id ||
      !j.report?.scorecard ||
      findings.some((x) => x.id === j.opportunity_id)
    )
      continue;
    const [sources, evidence, prior, op] = await Promise.all([
      db
        .from("analysis_sources")
        .select("url")
        .eq("user_id", userId)
        .eq("analysis_id", j.id)
        .limit(6),
      db
        .from("analysis_claims")
        .select("statement")
        .eq("user_id", userId)
        .eq("analysis_id", j.id)
        .eq("verification", "source_quote")
        .limit(100),
      db
        .from("analysis_jobs")
        .select("report")
        .eq("user_id", userId)
        .eq("opportunity_id", j.opportunity_id)
        .eq("status", "completed")
        .lt("updated_at", j.updated_at)
        .order("updated_at", { ascending: false })
        .limit(1),
      db
        .from("opportunities")
        .select("title")
        .eq("id", j.opportunity_id)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    [sources, evidence, prior, op].forEach((r) => dbCheck(r.error));
    findings.push({
      id: j.opportunity_id,
      analysis_id: j.id,
      title: op.data?.title || j.report.opportunity.title,
      score: j.report.scorecard.total,
      verified: new Set((evidence.data || []).map((c) => c.statement)).size,
      sources: (sources.data || []).map((s) => s.url),
      next_step:
        j.report.next_steps[0] ||
        "Samla oberoende belägg och testa betalningsviljan.",
      change: prior.data?.[0]?.report
        ? j.report.scorecard.total - prior.data[0].report.scorecard.total
        : null,
    });
  }
  findings.sort((a, b) => b.verified - a.verified || b.score - a.score);
  const content: Digest = {
    day,
    generated_at: new Date().toISOString(),
    findings,
    completed: completed.length,
    failed: (runs.data || []).filter((j) =>
      ["failed", "budget_exceeded"].includes(j.status),
    ).length,
    pending_approvals: approvals.count || 0,
    followups: followups.count || 0,
    note: "Sammanställd från sparade resultat under UTC-dygnet. Källcitat är inte oberoende faktakontroll. Ingen ny AI-kostnad för sammanfattningen. Högst 100 körningar och 20 fynd visas.",
  };
  const saved = await db
    .from("daily_digests")
    .upsert(
      { user_id: userId, day, content, updated_at: new Date().toISOString() },
      { onConflict: "user_id,day" },
    );
  dbCheck(saved.error);
  return content;
}
export async function automationSnapshot(db: SupabaseClient, userId: string) {
  const now = new Date(),
    month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
  const [controls, schedules, daily, monthly, audit, feedback] =
    await Promise.all([
      db
        .from("automation_controls")
        .select("enabled,daily_limit_cents,monthly_limit_cents")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("scan_schedules")
        .select(
          "id,name,topic,interval_days,budget_cents,enabled,next_run_at,last_run_at,last_error",
        )
        .eq("user_id", userId)
        .order("created_at"),
      db.rpc("budget_usage", {
        p_user: userId,
        p_since: `${now.toISOString().slice(0, 10)}T00:00:00Z`,
      }),
      db.rpc("budget_usage", { p_user: userId, p_since: month }),
      db
        .from("audit_events")
        .select("id,entity,action,record_id,metadata,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("outcome_feedback")
        .select(
          "id,opportunity_id,analysis_id,assumption,result,verdict,evidence_url,observed_at,test_reference,sample_size,positive_results",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
  [controls, schedules, daily, monthly, audit, feedback].forEach((r) =>
    dbCheck(r.error),
  );
  const readiness = await workerReadiness(userId);
  return {
    controls: (controls.data || defaultControls) as Controls,
    schedules: schedules.data || [],
    daily_microusd: Number(daily.data || 0),
    monthly_microusd: Number(monthly.data || 0),
    audit: audit.data || [],
    feedback: feedback.data || [],
    calibration: calibration(feedback.data || []),
    worker_configured: readiness.configured,
    worker_issues: readiness.issues,
    worker_connection_verified: readiness.connection_verified,
  };
}
