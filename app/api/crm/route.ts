import { NextResponse } from "next/server";
import { z } from "zod";
import { cashSchema, feedbackSchema } from "@/lib/automation";
import {
  checkOrigin,
  requireUser,
  jsonBody,
  dbCheck,
  failure,
  HttpError,
} from "@/lib/server/http";
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const [cash, drafts, totals, trend] = await Promise.all([
      db
        .from("cash_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("occurred_on", { ascending: false })
        .limit(200),
      db
        .from("sales_drafts")
        .select(
          "id,lead_id,subject,body,recipient,status,approval_id,error,provider_message_id,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("cash_totals"),
      db.rpc("cash_trend"),
    ]);
    [cash, drafts, totals, trend].forEach((r) => dbCheck(r.error));
    return NextResponse.json(
      {
        cash: cash.data,
        drafts: drafts.data,
        totals: totals.data,
        trend: trend.data,
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
    if (body.action === "cash") {
      const input = cashSchema.parse(body.entry);
      if (input.occurred_on > new Date().toISOString().slice(0, 10))
        throw new HttpError(
          400,
          "Registrera endast verkliga, redan inträffade utfall.",
        );
      const r = await db
        .from("cash_entries")
        .insert({ ...input, user_id: user.id });
      if (r.error?.code === "23505")
        throw new HttpError(
          409,
          "Denna betalning eller referens är redan registrerad. Kontrollera historiken.",
        );
      dbCheck(r.error);
    } else if (body.action === "void_cash") {
      const id = z.string().uuid().parse(body.id);
      dbCheck(
        (
          await db
            .from("cash_entries")
            .update({ voided_at: new Date().toISOString() })
            .eq("id", id)
            .eq("user_id", user.id)
            .is("voided_at", null)
        ).error,
      );
    } else if (body.action === "feedback") {
      const input = feedbackSchema.parse(body.feedback);
      const r = await db
        .from("outcome_feedback")
        .insert({ ...input, user_id: user.id });
      if (r.error?.code === "23505")
        throw new HttpError(
          409,
          "Den testreferensen är redan sparad för möjligheten. Samma test ska inte räknas flera gånger.",
        );
      dbCheck(r.error);
    } else if (body.action === "convert") {
      const id = z.string().uuid().parse(body.opportunity_id);
      const r = await db.rpc("opportunity_to_lead", { p_id: id });
      dbCheck(r.error);
      if (!r.data) throw new HttpError(404, "Möjligheten finns inte.");
      return NextResponse.json({ id: r.data });
    } else throw new HttpError(400, "Okänd åtgärd.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
