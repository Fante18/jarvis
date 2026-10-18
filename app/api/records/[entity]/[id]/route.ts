import { assertEntity,entitySchemas,idSchema } from "@/lib/domain";
import {
checkOrigin,
dbCheck,
failure,
HttpError,
jsonBody,
requireUser,
} from "@/lib/server/http";
import { NextResponse } from "next/server";
import { z } from "zod";
type Context = { params: Promise<{ entity: string; id: string }> };
export async function PATCH(req: Request, { params }: Context) {
  try {
    checkOrigin(req);
    const { entity, id } = await params;
    if (!assertEntity(entity)) throw new HttpError(404, "Okänd resurs.");
    idSchema.parse(id);
    const body = await jsonBody(req);
    const { db, user } = await requireUser();
    if (entity === "approvals") {
      const { status } = z
        .object({ status: z.enum(["approved", "rejected"]) })
        .strict()
        .parse(body);
      const result = await db
        .from("approvals")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();
      dbCheck(result.error);
      if (!result.data)
        throw new HttpError(409, "Beslutet är redan fattat eller saknas.");
      return NextResponse.json({ record: result.data });
    }
    const payload = entitySchemas[entity].parse(body);
    const result = await db
      .from(entity)
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();
    dbCheck(result.error);
    if (!result.data) throw new HttpError(404, "Posten finns inte.");
    return NextResponse.json({ record: result.data });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    checkOrigin(req);
    const { entity, id } = await params;
    if (!assertEntity(entity)) throw new HttpError(404, "Okänd resurs.");
    idSchema.parse(id);
    if (entity === "approvals")
      throw new HttpError(405, "Beslut bevaras i historiken.");
    const { db, user } = await requireUser();
    const result = await db
      .from(entity)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    dbCheck(result.error);
    if (!result.data) throw new HttpError(404, "Posten finns inte.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
