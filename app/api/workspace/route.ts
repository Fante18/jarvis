import { defaultSettings,settingsSchema } from "@/lib/domain";
import {
checkOrigin,
dbCheck,
failure,
jsonBody,
requireUser,
} from "@/lib/server/http";
import { NextResponse } from "next/server";
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const tables = [
      "agents",
      "opportunities",
      "signals",
      "leads",
      "approvals",
      "activities",
      "agent_runs",
      "messages",
    ] as const;
    const results = await Promise.all(
      tables.map((t) =>
        db
          .from(t)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(t === "messages" ? 60 : 200),
      ),
    );
    const data: Record<string, unknown> = {};
    results.forEach((r, i) => {
      dbCheck(r.error);
      data[tables[i]] = r.data?.map(({ user_id, ...row }) => row);
    });
    const settings = await db
      .from("settings")
      .select("workspace_name,focus_sectors,currency")
      .eq("user_id", user.id)
      .maybeSingle();
    dbCheck(settings.error);
    return NextResponse.json(
      {
        data,
        user: { email: user.email, id: user.id },
        settings: settings.data || defaultSettings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    const payload = settingsSchema.parse(await jsonBody(req));
    const result = await db
      .from("settings")
      .upsert({ ...payload, user_id: user.id }, { onConflict: "user_id" });
    dbCheck(result.error);
    return NextResponse.json({ settings: payload });
  } catch (e) {
    return failure(e);
  }
}
