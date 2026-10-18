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
const nameSchema = z
  .string()
  .min(1)
  .max(250)
  .regex(/^[a-zA-Z0-9._-]+$/);
export async function GET(req: Request) {
  try {
    const { db, user } = await requireUser();
    const name = new URL(req.url).searchParams.get("name");
    if (name) {
      nameSchema.parse(name);
      const r = await db.storage
        .from("research")
        .createSignedUrl(`${user.id}/${name}`, 60);
      dbCheck(r.error);
      return NextResponse.json({ url: r.data!.signedUrl });
    }
    const r = await db.storage
      .from("research")
      .list(user.id, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
    dbCheck(r.error);
    return NextResponse.json(
      { files: r.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    if (Number(req.headers.get("content-length") || 0) > 4.4e6)
      throw new HttpError(413, "Filen är för stor. Max 4 MB.");
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File) || f.size > 4194304 || f.size === 0)
      throw new HttpError(400, "Välj en fil på högst 4 MB.");
    const ext = f.name.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: "application/pdf",
      txt: "text/plain",
      csv: "text/csv",
    };
    if (!ext || !types[ext])
      throw new HttpError(400, "Endast PDF, TXT och CSV stöds.");
    const name = `${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;
    const r = await db.storage
      .from("research")
      .upload(`${user.id}/${name}`, f, {
        contentType: types[ext],
        upsert: false,
      });
    dbCheck(r.error);
    return NextResponse.json({ name }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    const { name } = z
      .object({ name: nameSchema })
      .strict()
      .parse(await jsonBody(req));
    const r = await db.storage.from("research").remove([`${user.id}/${name}`]);
    dbCheck(r.error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
