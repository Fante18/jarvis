import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import {
  checkOrigin,
  requireUser,
  failure,
  HttpError,
} from "@/lib/server/http";
import { gmailConfigured, encrypt, callbackUrl } from "@/lib/server/gmail";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { user } = await requireUser();
    if (!gmailConfigured())
      throw new HttpError(
        503,
        "Gmail OAuth är inte konfigurerat. Följ instruktionerna i Settings.",
      );
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    (await cookies()).set(
      "jarvis.gmail.state",
      encrypt({
        state,
        verifier,
        user_id: user.id,
        expires_at: Date.now() + 600000,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/integrations/gmail",
        maxAge: 600,
      },
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return NextResponse.json({ url: url.href });
  } catch (e) {
    return failure(e);
  }
}
