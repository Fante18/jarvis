import { NextResponse } from "next/server";
import { z } from "zod";
import { draftSchema } from "@/lib/automation";
import {
  checkOrigin,
  requireUser,
  jsonBody,
  dbCheck,
  failure,
  HttpError,
} from "@/lib/server/http";
import { createProposal, draftHash } from "@/lib/server/sales";
import { friendlyAIError } from "@/lib/server/ai";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    const body = await jsonBody(req);
    if (body.action === "generate") {
      const input = z
        .object({
          action: z.literal("generate"),
          lead_id: z.string().uuid(),
          offer: z.string().trim().min(5).max(1500),
        })
        .strict()
        .parse(body);
      const proposal = await createProposal(
        db,
        user.id,
        input.lead_id,
        input.offer,
        AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
      );
      return NextResponse.json({ proposal });
    }
    const input = draftSchema.parse(body);
    const lead = await db
      .from("leads")
      .select("email")
      .eq("id", input.lead_id)
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(lead.error);
    if (!lead.data) throw new HttpError(404, "Lead finns inte.");
    const r = await db
      .from("sales_drafts")
      .insert({
        ...input,
        recipient: lead.data.email,
        content_hash: draftHash(lead.data.email, input.subject, input.body),
        user_id: user.id,
      })
      .select("id")
      .single();
    dbCheck(r.error);
    return NextResponse.json({ id: r.data!.id }, { status: 201 });
  } catch (e) {
    return failure(
      e instanceof HttpError || e instanceof z.ZodError
        ? e
        : friendlyAIError(e),
    );
  }
}
