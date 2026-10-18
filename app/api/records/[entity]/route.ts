import { assertEntity,entitySchemas } from "@/lib/domain";
import {
checkOrigin,
dbCheck,
failure,
HttpError,
jsonBody,
requireUser,
} from "@/lib/server/http";
import { NextResponse } from "next/server";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  try {
    checkOrigin(req);
    const { entity } = await params;
    if (!assertEntity(entity)) throw new HttpError(404, "Okänd resurs.");
    const payload = entitySchemas[entity].parse(await jsonBody(req));
    const { db, user } = await requireUser();
    const result = await db
      .from(entity)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single();
    dbCheck(result.error);
    return NextResponse.json({ record: result.data }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
