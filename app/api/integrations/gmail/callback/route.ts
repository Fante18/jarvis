import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/http";
import { connectGoogle, decrypt, equal } from "@/lib/server/gmail";
export async function GET(req: Request) {
  const store = await cookies(),
    saved = store.get("jarvis.gmail.state")?.value;
  store.set("jarvis.gmail.state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/gmail",
    maxAge: 0,
  });
  const redirect = new URL("/settings", process.env.APP_URL || req.url);
  try {
    const { user } = await requireUser();
    const url = new URL(req.url);
    if (!saved || url.searchParams.has("error"))
      throw new Error("OAuth declined");
    const state = z
      .object({
        state: z.string(),
        verifier: z.string(),
        user_id: z.string().uuid(),
        expires_at: z.number(),
      })
      .parse(decrypt(saved));
    if (
      !equal(state.state, url.searchParams.get("state") || "") ||
      state.user_id !== user.id ||
      state.expires_at < Date.now()
    )
      throw new Error("Invalid OAuth state");
    const code = z
      .string()
      .min(1)
      .max(3000)
      .parse(url.searchParams.get("code"));
    await connectGoogle(code, state.verifier, user.id);
    redirect.searchParams.set("gmail", "connected");
  } catch {
    redirect.searchParams.set("gmail", "error");
  }
  return NextResponse.redirect(redirect);
}
