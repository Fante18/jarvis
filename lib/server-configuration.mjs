// Pure validation shared by server code and the local configuration check.
// Never return credential values from a diagnostic response.
/** @param {string | undefined} raw */
export function serverSupabaseKey(raw) {
  const value = (raw || "").trim();
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) return value;
  // Legacy keys remain valid alongside modern secret keys. Supabase verifies the
  // signature remotely; decoding the role here is format checking, not authentication.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
    return "";
  try {
    const payload = JSON.parse(
      Buffer.from(value.split(".")[1], "base64url").toString("utf8"),
    );
    return payload &&
      typeof payload === "object" &&
      payload.role === "service_role"
      ? value
      : "";
  } catch {
    return "";
  }
}
/** @param {string | undefined} value */
export function validCronSecret(value) {
  return Boolean(
    value &&
      value.length >= 32 &&
      value === value.trim() &&
      !/[\r\n]/.test(value),
  );
}
/** @param {string | undefined} value */
function validServerUrl(value) {
  try {
    const url = new URL(value || "");
    return (
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
/** @param {Record<string, string | undefined>} env */
export function workerConfiguration(env) {
  /** @type {{variable:string;code:string;message:string}[]} */
  const issues = [];
  if (!env.SUPABASE_SECRET_KEY?.trim())
    issues.push({
      variable: "SUPABASE_SECRET_KEY",
      code: "missing",
      message:
        "SUPABASE_SECRET_KEY saknas i den här publiceringen. Lägg servernyckeln i Vercel Production och gör Redeploy.",
    });
  else if (!serverSupabaseKey(env.SUPABASE_SECRET_KEY))
    issues.push({
      variable: "SUPABASE_SECRET_KEY",
      code: "invalid_format",
      message:
        "SUPABASE_SECRET_KEY har fel format. Använd en Secret key (sb_secret_…) eller en äldre service_role-nyckel från rätt Supabase-projekt, inte publishable/anon. Kopiera utan citattecken.",
    });
  if (!env.CRON_SECRET)
    issues.push({
      variable: "CRON_SECRET",
      code: "missing",
      message:
        "CRON_SECRET saknas i den här publiceringen. Lägg en privat slumphemlighet i Vercel Production och gör Redeploy.",
    });
  else if (env.CRON_SECRET.length < 32)
    issues.push({
      variable: "CRON_SECRET",
      code: "too_short",
      message:
        "CRON_SECRET är för kort. Den måste innehålla minst 32 slumpmässiga tecken. Använd resultatet från exempelvis openssl rand -hex 32, inte själva kommandot.",
    });
  else if (!validCronSecret(env.CRON_SECRET))
    issues.push({
      variable: "CRON_SECRET",
      code: "whitespace",
      message:
        "CRON_SECRET innehåller radbrytning eller extra blanksteg i början/slutet. Ta bort dem i Vercel och gör Redeploy.",
    });
  if (!validServerUrl(env.NEXT_PUBLIC_SUPABASE_URL))
    issues.push({
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      code: env.NEXT_PUBLIC_SUPABASE_URL ? "invalid_format" : "missing",
      message:
        "NEXT_PUBLIC_SUPABASE_URL måste vara projektets giltiga API-adress utan sökväg eller inloggningsuppgifter.",
    });
  if (!env.OPENAI_API_KEY?.trim())
    issues.push({
      variable: "OPENAI_API_KEY",
      code: "missing",
      message:
        "OPENAI_API_KEY saknas i den här publiceringen. Lägg till den i Production och gör Redeploy.",
    });
  return { configured: issues.length === 0, issues };
}
