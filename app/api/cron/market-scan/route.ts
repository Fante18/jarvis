import { NextResponse } from "next/server";
import {
  authorizeCron,
  serverDb,
  saveDigest,
} from "@/lib/server/automation/service";
import { executeAnalysis } from "@/lib/server/analysis/orchestrator";
import { analysisStore } from "@/lib/server/analysis/store";
import { loadMemory } from "@/lib/server/automation/service";
import { dbCheck, failure } from "@/lib/server/http";
import { requireAI } from "@/lib/server/ai";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    authorizeCron(req.headers.get("authorization"));
    requireAI();
    const db = serverDb();
    // A platform crash is never retried blindly. Saved partial steps remain available for manual review.
    dbCheck(
      (
        await db
          .from("analysis_jobs")
          .update({
            status: "failed",
            error:
              "Bakgrundskörningen avbröts. Granska sparade steg innan återupptagning.",
          })
          .not("schedule_id", "is", null)
          .in("status", ["queued", "running"])
          .lt("lease_until", new Date().toISOString())
      ).error,
    );
    const queued = await db.rpc("queue_due_scans");
    dbCheck(queued.error);
    const jobs = (queued.data || []) as { id: string; user_id: string }[];
    const outcomes = await Promise.allSettled(
      jobs.map(async (job) => {
        await executeAnalysis(job.id, {
          store: analysisStore(db, job.user_id, true),
          loadMemory: (j) => loadMemory(db, job.user_id, j),
        });
      }),
    );
    const owners = await db
      .from("automation_controls")
      .select("user_id")
      .eq("enabled", true)
      .order("user_id")
      .limit(20);
    dbCheck(owners.error);
    const digestOwners = [
      ...new Set([
        ...jobs.map((j) => j.user_id),
        ...(owners.data || []).map((o) => o.user_id),
      ]),
    ];
    const digests = await Promise.allSettled(
      digestOwners.map((id) => saveDigest(db, id, true)),
    );
    return NextResponse.json(
      {
        digests: digests.filter((d) => d.status === "fulfilled").length,
        queued: jobs.length,
        processed: outcomes.filter((o) => o.status === "fulfilled").length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
