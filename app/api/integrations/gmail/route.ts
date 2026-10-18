import { NextResponse } from "next/server";
import { requireUser, checkOrigin, failure, dbCheck } from "@/lib/server/http";
import { gmailConfigured, disconnectGoogle } from "@/lib/server/gmail";
import { serverDb } from "@/lib/server/automation/service";
export async function GET() {
  try {
    const { user } = await requireUser();
    let email = null;
    if (process.env.SUPABASE_SECRET_KEY) {
      const r = await serverDb()
        .from("email_connections")
        .select("email")
        .eq("user_id", user.id)
        .maybeSingle();
      dbCheck(r.error);
      email = r.data?.email || null;
    }
    return NextResponse.json(
      { configured: gmailConfigured(), email },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const { user } = await requireUser();
    await disconnectGoogle(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
