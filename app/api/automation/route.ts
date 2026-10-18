import { NextResponse } from "next/server";
import { z } from "zod";
import { controlsSchema, scheduleSchema } from "@/lib/automation";
import {
  checkOrigin,
  requireUser,
  jsonBody,
  dbCheck,
  failure,
  HttpError,
} from "@/lib/server/http";
import {
  automationSnapshot,
  saveDigest,
  workerReadiness,
} from "@/lib/server/automation/service";
export async function GET(req: Request) {
  try {
    const { db, user } = await requireUser();
    return NextResponse.json(
      {
        ...(await automationSnapshot(db, user.id)),
        digest: await saveDigest(
          db,
          user.id,
          new URL(req.url).searchParams.get("refresh") === "1",
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    const body = await jsonBody(req);
    if (body.action === "controls") {
      const input = controlsSchema.parse(body.controls);
      if (input.enabled) {
        const readiness = await workerReadiness(user.id);
        if (!readiness.configured)
          throw new HttpError(
            503,
            readiness.issues.map((i) => i.message).join(" "),
          );
      }
      dbCheck(
        (
          await db.from("automation_controls").upsert(
            {
              ...input,
              user_id: user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          )
        ).error,
      );
    } else if (body.action === "schedule") {
      const input = scheduleSchema.parse(body.schedule);
      const id = body.id ? z.string().uuid().parse(body.id) : undefined;
      if (id) {
        const r = await db
          .from("scan_schedules")
          .update({ ...input, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();
        dbCheck(r.error);
        if (!r.data) throw new HttpError(404, "Schemat saknas.");
      } else
        dbCheck(
          (
            await db
              .from("scan_schedules")
              .insert({ ...input, user_id: user.id })
          ).error,
        );
    } else if (body.action === "delete_schedule") {
      const id = z.string().uuid().parse(body.id);
      dbCheck(
        (
          await db
            .from("scan_schedules")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id)
        ).error,
      );
    } else throw new HttpError(400, "Okänd åtgärd.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
