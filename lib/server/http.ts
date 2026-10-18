import { mutationOriginAllowed } from "@/lib/domain";
import { NextResponse } from "next/server";
import "server-only";
import { ZodError } from "zod";
import { isConfigured, supabase } from "./supabase";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser() {
  if (!isConfigured())
    throw new HttpError(
      503,
      "Konfigurera Supabase enligt Settings och README.",
    );
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new HttpError(401, "Logga in för att använda din arbetsyta.");
  return { db, user };
}
export function checkOrigin(req: Request) {
  if (
    !mutationOriginAllowed(
      req.headers.get("origin"),
      req.url,
      process.env.APP_URL,
    )
  )
    throw new HttpError(
      403,
      "Anropets ursprung är inte tillåtet. Kontrollera APP_URL.",
    );
}
export async function jsonBody(req: Request) {
  const body = await req.text();
  if (body.length > 32000) throw new HttpError(413, "För stor begäran.");
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Ogiltig JSON.");
  }
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        "Kunde inte slutföra begäran. Kontrollera databasens migration och försök igen.",
    },
    { status: 500 },
  );
}
export function dbCheck(error: { message: string } | null) {
  if (error)
    throw new HttpError(
      500,
      "Databasanropet misslyckades. Kontrollera migrationen och databasanslutningen.",
    );
}
