import { after, NextResponse } from "next/server";
import { analysisRequestSchema } from "@/lib/analysis/contracts";
import {
  requireUser,
  checkOrigin,
  jsonBody,
  failure,
  dbCheck,
  HttpError,
} from "@/lib/server/http";
import { requireAI, reserveAI, workspaceContext } from "@/lib/server/ai";
import { executeAnalysis } from "@/lib/server/analysis/orchestrator";
import {
  analysisStore,
  prepareAnalysisSession,
} from "@/lib/server/analysis/store";
export const maxDuration = 300;
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const r = await db
      .from("analysis_summaries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    dbCheck(r.error);
    return NextResponse.json(
      { analyses: r.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const input = analysisRequestSchema.parse(await jsonBody(req));
    const { db, user } = await requireUser();
    requireAI();
    if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL !== "gpt-4.1-mini")
      throw new HttpError(
        503,
        "Analysflödets prisram kräver OPENAI_MODEL=gpt-4.1-mini.",
      );
    await prepareAnalysisSession(db);
    await reserveAI(db);
    const stale = await db
      .from("analysis_jobs")
      .update({
        status: "failed",
        error: "Körmiljön avbröt körningen. Sparade steg kan återupptas.",
      })
      .eq("user_id", user.id)
      .in("status", ["queued", "running"])
      .lt("lease_until", new Date().toISOString());
    dbCheck(stale.error);
    const private_context = input.include_sales
      ? (await workspaceContext(db, user.id)).slice(0, 8000)
      : "";
    const r = await db
      .from("analysis_jobs")
      .insert({
        ...input,
        private_context,
        user_id: user.id,
        lease_until: new Date(Date.now() + 300000).toISOString(),
      })
      .select("id")
      .single();
    if (r.error?.code === "23505")
      throw new HttpError(
        409,
        "En analys körs redan. Granska den innan du startar en ny.",
      );
    dbCheck(r.error);
    const id = r.data!.id;
    after(async () => {
      try {
        await executeAnalysis(id, { store: analysisStore(db, user.id) });
      } catch {
        console.error(
          "JARVIS analysis worker failed; inspect saved job status",
          { analysis_id: id },
        );
      }
    });
    return NextResponse.json({ id, status: "queued" }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
