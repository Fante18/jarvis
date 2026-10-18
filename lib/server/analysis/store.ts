import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisJob,
  StageResult,
  FinalAnalysis,
  AgentRole,
} from "@/lib/analysis/contracts";
import type { RunBudget } from "@/lib/analysis/policy";
import { dbCheck, HttpError } from "../http";
import type { AnalysisStore } from "./orchestrator";
export function analysisStore(
  db: SupabaseClient,
  userId: string,
  worker = false,
): AnalysisStore {
  const token = crypto.randomUUID();
  async function update(id: string, patch: Record<string, unknown>) {
    const r = await db
      .from("analysis_jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("lease_token", token)
      .eq("status", "running")
      .select("id")
      .maybeSingle();
    dbCheck(r.error);
    if (!r.data)
      throw new Error("Körningens lås har löpt ut eller tagits över.");
  }
  const amounts = (b: RunBudget) => ({
    spent_microusd: b.spent,
    reserved_microusd: b.reserved,
    attempted_calls: b.calls,
  });
  return {
    async claim(id) {
      const r = await db.rpc("claim_analysis", { p_id: id, p_token: token });
      dbCheck(r.error);
      if (!r.data)
        throw new HttpError(
          409,
          "Analysen körs redan eller kan inte återupptas.",
        );
      return r.data as AnalysisJob;
    },
    async reserve(id, role: AgentRole, budget) {
      await update(id, { active_role: role, ...amounts(budget) });
    },
    async checkpoint(id, position, result: StageResult, budget) {
      const r = await db.rpc("checkpoint_analysis", {
        p_id: id,
        p_token: token,
        p_position: position,
        p_result: result,
        p_spent: budget.spent,
        p_reserved: budget.reserved,
      });
      dbCheck(r.error);
    },
    async cancelled(id) {
      const r = await db
        .from("analysis_jobs")
        .select("cancel_requested")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      dbCheck(r.error);
      if (r.data?.cancel_requested) return true;
      if (worker) {
        const job = await db
          .from("analysis_jobs")
          .select("schedule_id")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        dbCheck(job.error);
        const controls = await db
          .from("automation_controls")
          .select("enabled")
          .eq("user_id", userId)
          .maybeSingle();
        dbCheck(controls.error);
        const schedule = await db
          .from("scan_schedules")
          .select("enabled")
          .eq("id", job.data?.schedule_id)
          .eq("user_id", userId)
          .maybeSingle();
        dbCheck(schedule.error);
        return !controls.data?.enabled || !schedule.data?.enabled;
      }
      return false;
    },
    async complete(id, report: FinalAnalysis, budget) {
      const r = await db.rpc("finish_analysis", {
        p_id: id,
        p_token: token,
        p_report: report,
        p_spent: budget.spent,
        p_reserved: budget.reserved,
      });
      dbCheck(r.error);
    },
    async fail(id, status, message, budget) {
      await update(id, {
        status,
        error: message,
        active_role: null,
        lease_until: null,
        ...amounts(budget),
      });
    },
  };
}

export async function prepareAnalysisSession(db: SupabaseClient) {
  const session = await db.auth.getSession();
  if (session.error || !session.data.session)
    throw new HttpError(401, "Logga in innan en längre analys startas.");
  if ((session.data.session.expires_at || 0) < Date.now() / 1000 + 360) {
    const refreshed = await db.auth.refreshSession();
    if (refreshed.error)
      throw new HttpError(401, "Logga in igen innan en längre analys startas.");
  }
}

export const PUBLIC_ANALYSIS_FIELDS =
  "id,topic,notes,budget_cents,include_sales,status,active_role,results,report,attempted_calls,spent_microusd,reserved_microusd,error,cancel_requested,created_at,updated_at,lease_until,opportunity_id";
