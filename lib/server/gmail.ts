import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { HttpError, dbCheck } from "./http";
import { serverDb } from "./automation/service";
export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.EMAIL_ENCRYPTION_KEY &&
      process.env.SUPABASE_SECRET_KEY &&
      process.env.APP_URL,
  );
}
function key() {
  const v = process.env.EMAIL_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(v) || Buffer.from(v, "base64").length !== 32)
    throw new HttpError(
      503,
      "EMAIL_ENCRYPTION_KEY måste vara 32 slumpbyte i base64, endast på servern.",
    );
  return Buffer.from(v, "base64");
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  const b = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), b].map((v) => v.toString("base64url")).join(".");
}
export function decrypt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted state");
  const [iv, tag, data] = parts.map((v) => Buffer.from(v, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([d.update(data), d.final()]).toString("utf8"),
  );
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const callbackUrl = () =>
  `${new URL(process.env.APP_URL!).origin}/api/integrations/gmail/callback`;
const tokensSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    expires_in: z.number(),
    scope: z.string().optional(),
  })
  .passthrough();
export async function tokenRequest(params: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "Google nekade anslutningen. Anslut kontot igen och kontrollera OAuth-inställningarna.",
    );
  return tokensSchema.parse(await response.json());
}
export async function connectGoogle(
  code: string,
  verifier: string,
  userId: string,
) {
  const token = await tokenRequest({
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl(),
    grant_type: "authorization_code",
  });
  if (
    !token.refresh_token ||
    !token.scope
      ?.split(" ")
      .includes("https://www.googleapis.com/auth/gmail.send")
  )
    throw new HttpError(
      400,
      "Google gav inte den nödvändiga sändbehörigheten eller bestående anslutningen.",
    );
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new HttpError(502, "Kunde inte verifiera Google-kontot.");
  const user = z
    .object({ email: z.string().email(), email_verified: z.literal(true) })
    .parse(await r.json());
  dbCheck(
    (
      await serverDb()
        .from("email_connections")
        .upsert(
          {
            user_id: userId,
            email: user.email,
            encrypted_tokens: encrypt({
              ...token,
              expires_at: Date.now() + token.expires_in * 1000,
            }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
    ).error,
  );
}
async function connection(userId: string) {
  const db = serverDb(),
    r = await db
      .from("email_connections")
      .select("email,encrypted_tokens")
      .eq("user_id", userId)
      .maybeSingle();
  dbCheck(r.error);
  if (!r.data) throw new HttpError(409, "Anslut Gmail i Settings först.");
  let token = decrypt(r.data.encrypted_tokens);
  if (typeof token.refresh_token !== "string")
    throw new HttpError(409, "Anslut Google-kontot igen.");
  if (token.expires_at < Date.now() + 60000) {
    const updated = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    });
    token = {
      ...token,
      ...updated,
      expires_at: Date.now() + updated.expires_in * 1000,
    };
    dbCheck(
      (
        await db
          .from("email_connections")
          .update({
            encrypted_tokens: encrypt(token),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
      ).error,
    );
  }
  return { email: r.data.email, access_token: token.access_token as string };
}
export function rawMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
) {
  z.string().email().parse(from);
  z.string().email().parse(to);
  if (/[\r\n]/.test(from + to + subject))
    throw new HttpError(400, "Ogiltiga mejlhuvuden.");
  return Buffer.from(
    [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      Buffer.from(body)
        .toString("base64")
        .match(/.{1,76}/g)!
        .join("\r\n"),
    ].join("\r\n"),
  ).toString("base64url");
}
export async function sendGoogle(
  userId: string,
  to: string,
  subject: string,
  body: string,
) {
  const c = await connection(userId);
  const raw = rawMessage(c.email, to, subject, body);
  // No automatic retries: delivery may have succeeded even if the response was lost.
  const r = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok)
    throw new HttpError(
      502,
      "Google bekräftade inte leveransen. Kontrollera Skickat i Gmail innan ett nytt utskick övervägs.",
    );
  return z.object({ id: z.string().min(1) }).parse(await r.json()).id;
}
export async function disconnectGoogle(userId: string) {
  const db = serverDb();
  const r = await db
    .from("email_connections")
    .select("encrypted_tokens")
    .eq("user_id", userId)
    .maybeSingle();
  dbCheck(r.error);
  if (r.data) {
    try {
      const t = decrypt(r.data.encrypted_tokens);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.refresh_token || t.access_token }),
        signal: AbortSignal.timeout(10000),
      });
    } finally {
      dbCheck(
        (await db.from("email_connections").delete().eq("user_id", userId))
          .error,
      );
    }
  }
}
