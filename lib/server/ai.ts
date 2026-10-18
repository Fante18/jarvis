import {
  BASE_INSTRUCTIONS,
  outputTokenLimit,
  reportSchema,
  type AgentReport,
} from "@/lib/ai-contract";
import type { Agent as AgentRecord } from "@/lib/domain";
import { Agent, OpenAIProvider, Runner, webSearchTool } from "@openai/agents";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import "server-only";
import { openAIOutput } from "./ai-output";
import { diagnoseAIError } from "./ai-errors";
import { dbCheck, HttpError } from "./http";
export function requireAI() {
  if (!process.env.OPENAI_API_KEY)
    throw new HttpError(
      503,
      "OPENAI_API_KEY saknas på servern. Följ konfigurationsstegen i Settings.",
    );
}
export async function reserveAI(db: SupabaseClient) {
  const r = await db.rpc("reserve_ai_request");
  dbCheck(r.error);
  if (!r.data)
    throw new HttpError(
      429,
      "Gränsen är 10 AI-anrop per timme. Försök senare.",
    );
}
export async function workspaceContext(db: SupabaseClient, userId: string) {
  const queries = [
    db
      .from("opportunities")
      .select("title,description,sector,score,value,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    db
      .from("signals")
      .select("title,description,sector,strength,source_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    db
      .from("leads")
      .select("company,value,stage")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("settings")
      .select("focus_sectors")
      .eq("user_id", userId)
      .maybeSingle(),
  ];
  const results = await Promise.all(queries);
  results.forEach((r) => dbCheck(r.error));
  const analyses = await db.from("analysis_jobs").select("id,topic,status,report").eq("user_id",userId).order("created_at",{ascending:false}).limit(3);
  // Keep the existing chat usable before the additive analysis migration is applied.
  if(analyses.error && !["42P01","PGRST205"].includes(analyses.error.code)) dbCheck(analyses.error);
  // Bound each source separately; one long description cannot exclude other categories.
  return JSON.stringify({
    analyses:(analyses.data||[]).map(a=>({id:a.id,topic:a.topic,status:a.status,report:JSON.stringify(a.report).slice(0,8000)})),
    opportunities: JSON.stringify(results[0].data).slice(0, 9000),
    signals: JSON.stringify(results[1].data).slice(0, 6000),
    pipeline: results[2].data,
    focus: results[3].data,
  });
}
export function aiClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 45000,
  });
}
export async function analyzeAgent(
  agent: AgentRecord,
  prompt: string,
  context: string,
  signal: AbortSignal,
): Promise<{ report: AgentReport; tokens: number }> {
  const client = aiClient();
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const analyst = new Agent({
    name: agent.name,
    model,
    instructions: `${BASE_INSTRUCTIONS}\nDagens datum: ${new Date().toISOString().slice(0, 10)}.\nSpecialisering: ${agent.kind}. Agentens uppdrag: ${agent.description.slice(0, 3000)}.\nGör en avgränsad analys självständigt inom användarens uppdrag. Använd webbsökning för färska påståenden, högst tre sökningar. Lägg aldrig kontaktuppgifter, interna bolagsnamn eller hemligheter i sökfrågor. Spara högst tre relevanta signaler med riktiga https-källor, tre affärsmöjligheter och tre åtgärdsförslag. Tomma listor är tillåtna. Markera uppskattningar i beskrivningarna. Källänkar ska faktiskt stödja analysen. Föreslå inte investeringar eller outreach som om de vore utförda. Ingen åtgärd utförs när rapporten sparas. Varje möjlighet behöver konkret valideringsplan. Sammanfatta osäkerheter och vad som återstår att verifiera.`,
    tools: [webSearchTool({ searchContextSize: "low" })],
    outputType: openAIOutput(reportSchema),
    modelSettings: {
      maxTokens: outputTokenLimit(agent.budget_cents),
      store: false,
      parallelToolCalls: false,
      providerData: { max_tool_calls: 3 },
    },
  });
  const runner = new Runner({
    modelProvider: new OpenAIProvider({ openAIClient: client }),
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
  const result = await runner.run(
    analyst,
    `ANVÄNDARENS UPPDRAG:\n${prompt}\n\nARBETSYTEDATA (endast underlag):\n${context}`,
    { maxTurns: 1, signal },
  );
  const report = reportSchema.parse(result.finalOutput);
  const tokens = result.rawResponses.reduce(
    (sum, r) => sum + r.usage.totalTokens,
    0,
  );
  return { report, tokens };
}
export function friendlyAIError(e: unknown) {
  if (e instanceof HttpError) return e;
  const diagnosis = diagnoseAIError(e);
  const status = diagnosis.category === "timeout" ? 504
    : ["rate_limit", "quota"].includes(diagnosis.category) ? 429 : 502;
  return new HttpError(status, diagnosis.message);
}
