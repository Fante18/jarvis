import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUser,
  checkOrigin,
  jsonBody,
  failure,
  dbCheck,
  HttpError,
} from "@/lib/server/http";
import { requireAI, reserveAI } from "@/lib/server/ai";
import { executeAnalysis } from "@/lib/server/analysis/orchestrator";
import {
  analysisStore,
  prepareAnalysisSession,
  PUBLIC_ANALYSIS_FIELDS,
} from "@/lib/server/analysis/store";
import { loadMemory } from "@/lib/server/automation/service";
export const maxDuration = 300;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(req);
    const { id } = await params;
    z.string().uuid().parse(id);
    const { action } = z
      .object({ action: z.enum(["cancel", "resume"]) })
      .strict()
      .parse(await jsonBody(req));
    const { db, user } = await requireUser();
    const r = await db
      .from("analysis_jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(r.error);
    if (!r.data) throw new HttpError(404, "Analysen finns inte.");
    if (action === "cancel") {
      if (!["queued", "running"].includes(r.data.status))
        throw new HttpError(409, "Analysen körs inte.");
      const saved = await db
        .from("analysis_jobs")
        .update({ cancel_requested: true })
        .eq("id", id)
        .eq("user_id", user.id);
      dbCheck(saved.error);
      return NextResponse.json({ status: "cancel_requested" });
    }
    requireAI();
    if (
      r.data.status !== "failed" &&
      !(
        ["running", "queued"].includes(r.data.status) &&
        Date.parse(r.data.lease_until) < Date.now()
      )
    )
      throw new HttpError(
        409,
        "Endast avbrutna eller misslyckade analyser kan återupptas.",
      );
    if (
      r.data.spent_microusd + r.data.reserved_microusd >=
        r.data.budget_cents * 10000 ||
      r.data.attempted_calls >= (r.data.include_sales ? 10 : 9)
    )
      throw new HttpError(
        409,
        "Körningens budget eller anropsgräns är förbrukad.",
      );
    await prepareAnalysisSession(db);
    await reserveAI(db);
    const store = analysisStore(db, user.id);
    after(async () => {
      try {
        await executeAnalysis(id, {
          store,
          loadMemory: (j) => loadMemory(db, user.id, j),
        });
      } catch {
        console.error("JARVIS resume failed", { analysis_id: id });
      }
    });
    return NextResponse.json({ id, status: "resuming" }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    z.string().uuid().parse(id);
    const { db, user } = await requireUser();
    const r = await db
      .from("analysis_jobs")
      .select(PUBLIC_ANALYSIS_FIELDS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(r.error);
    if (!r.data) throw new HttpError(404, "Analysen finns inte.");
    return NextResponse.json(
      { analysis: r.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
