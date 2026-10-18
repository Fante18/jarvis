import { agentRequestSchema } from "@/lib/ai-contract";
import type { Agent } from "@/lib/domain";
import {
  analyzeAgent,
  friendlyAIError,
  requireAI,
  reserveAI,
  workspaceContext,
} from "@/lib/server/ai";
import {
  checkOrigin,
  dbCheck,
  failure,
  HttpError,
  jsonBody,
  requireUser,
} from "@/lib/server/http";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
export const maxDuration = 60;
export async function POST(req: Request) {
  let runId: string | undefined;
  let ctx: Awaited<ReturnType<typeof requireUser>> | undefined;
  try {
    checkOrigin(req);
    const input = agentRequestSchema.parse(await jsonBody(req));
    ctx = await requireUser();
    requireAI();
    const { db, user } = ctx;
    const r = await db
      .from("agents")
      .select("*")
      .eq("id", input.agent_id)
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(r.error);
    if (!r.data) throw new HttpError(404, "Agenten finns inte.");
    const agent = r.data as Agent;
    if (agent.status !== "active")
      throw new HttpError(409, "Aktivera agenten innan du kör den.");
    // Recover abandoned runs after platform shutdown/timeouts. Never report them as successful.
    const stale = await db
      .from("agent_runs")
      .update({
        status: "failed",
        error: "Körningen avbröts innan ett resultat sparades.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("status", "running")
      .lt("created_at", new Date(Date.now() - 120000).toISOString());
    dbCheck(stale.error);
    await reserveAI(db);
    const created = await db
      .from("agent_runs")
      .insert({
        user_id: user.id,
        agent_id: agent.id,
        status: "running",
        input: input.prompt,
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      })
      .select("id")
      .single();
    if (created.error?.code === "23505")
      throw new HttpError(409, "En agent körs redan. Vänta tills den är klar.");
    dbCheck(created.error);
    runId = created.data!.id;
    const context = await workspaceContext(db, user.id);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(50000)]);
    const { report, tokens } = await analyzeAgent(
      agent,
      input.prompt,
      context,
      signal,
    );
    const saved = await db.rpc("complete_agent_run", {
      p_run_id: runId,
      p_report: report,
      p_tokens: tokens,
    });
    dbCheck(saved.error);
    return NextResponse.json({
      output: report.summary,
      run_id: runId,
      created: {
        signals: report.signals.length,
        opportunities: report.opportunities.length,
        approvals: report.approvals.length,
      },
    });
  } catch (e) {
    const error =
      e instanceof HttpError || (e instanceof ZodError && !runId)
        ? e
        : friendlyAIError(e);
    if (runId && ctx) {
      await ctx.db
        .from("agent_runs")
        .update({
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("user_id", ctx.user.id)
        .eq("status", "running");
    }
    return failure(error);
  }
}
