import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkOrigin,
  requireUser,
  jsonBody,
  dbCheck,
  failure,
  HttpError,
} from "@/lib/server/http";
import { serverDb } from "@/lib/server/automation/service";
import { gmailConfigured, sendGoogle } from "@/lib/server/gmail";
import { draftHash } from "@/lib/server/sales";
export const maxDuration = 60;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { action } = z
      .object({ action: z.enum(["request_approval", "send"]) })
      .strict()
      .parse(await jsonBody(req));
    const r = await db
      .from("sales_drafts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(r.error);
    if (!r.data) throw new HttpError(404, "Utkastet finns inte.");
    const d = r.data;
    if (draftHash(d.recipient, d.subject, d.body) !== d.content_hash)
      throw new HttpError(
        409,
        "Utkastets innehåll stämmer inte med granskningsunderlaget.",
      );
    if (action === "request_approval") {
      if (d.status !== "draft")
        throw new HttpError(409, "Utkastet har redan skickats för beslut.");
      if (!z.string().email().safeParse(d.recipient).success)
        throw new HttpError(
          400,
          "Lägg in en verklig, kontrollerad e-postadress på leaden och skapa ett nytt utkast.",
        );
      const saved = await db.rpc("submit_sales_draft", { p_id: id });
      dbCheck(saved.error);
      return NextResponse.json({ ok: true });
    }
    if (!gmailConfigured())
      throw new HttpError(
        503,
        "Anslut Gmail i Settings innan ett godkänt utkast kan skickas.",
      );
    const service = serverDb();
    const claimed = await service.rpc("claim_sales_send", {
      p_id: id,
      p_user: user.id,
    });
    if (claimed.error)
      throw new HttpError(
        409,
        "Utskicket kräver godkännande, dokumenterat samtycke och en oförändrad mottagaradress. Kontrollera leaden.",
      );
    if (!claimed.data)
      throw new HttpError(
        409,
        "Utkastet är redan hanterat eller saknar godkännande.",
      );
    try {
      const messageId = await sendGoogle(
        user.id,
        d.recipient,
        d.subject,
        d.body,
      );
      dbCheck(
        (
          await service
            .from("sales_drafts")
            .update({
              status: "sent",
              provider_message_id: messageId,
              error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", user.id)
            .eq("status", "sending")
        ).error,
      );
      // Delivery confirmation is saved independently of the optional CRM stage update.
      await service
        .from("leads")
        .update({ stage: "contacted" })
        .eq("id", d.lead_id)
        .eq("user_id", user.id)
        .eq("stage", "new");
      return NextResponse.json({ ok: true });
    } catch {
      await service
        .from("sales_drafts")
        .update({
          status: "unknown",
          error:
            "Ingen säker leveransbekräftelse kunde sparas. Kontrollera Skickat i Gmail. Utskicket upprepas inte automatiskt.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "sending");
      throw new HttpError(
        502,
        "Leveransstatus är osäker. Kontrollera Skickat i Gmail innan du skapar ett nytt utskick.",
      );
    }
  } catch (e) {
    return failure(e);
  }
}
