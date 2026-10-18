import { checkOrigin,failure,HttpError,jsonBody } from "@/lib/server/http";
import { supabase } from "@/lib/server/supabase";
import { NextResponse } from "next/server";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = z
      .object({
        action: z.enum(["login", "signup", "logout"]),
        email: z.string().email().optional(),
        password: z.string().min(12).max(200).optional(),
      })
      .strict()
      .parse(await jsonBody(req));
    const db = await supabase();
    if (body.action === "logout") {
      const { error } = await db.auth.signOut();
      if (error) throw new HttpError(400, "Utloggning misslyckades.");
      return NextResponse.json({ ok: true });
    }
    if (!body.email || !body.password)
      throw new HttpError(400, "Ange e-post och lösenord (minst 12 tecken).");
    const result =
      body.action === "login"
        ? await db.auth.signInWithPassword({
            email: body.email,
            password: body.password,
          })
        : await db.auth.signUp({
            email: body.email,
            password: body.password,
            options: {
              emailRedirectTo: `${process.env.APP_URL || new URL(req.url).origin}/auth/callback`,
            },
          });
    if (result.error)
      throw new HttpError(
        400,
        body.action === "login"
          ? "Inloggningen misslyckades. Kontrollera uppgifterna."
          : "Kontot kunde inte skapas. Kontrollera uppgifterna eller försök senare.",
      );
    return NextResponse.json({
      ok: true,
      verify: body.action === "signup" && !result.data.session,
    });
  } catch (e) {
    return failure(e);
  }
}
