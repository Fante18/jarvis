// Read-only configuration validation. Never print values or call a paid API.
const env = process.env;
let failures = 0;
function check(name, validate, optional = false) {
  const value = env[name];
  if (!value) {
    console.log(`${optional ? "STANDARD" : "SAKNAS"}: ${name}`);
    if (!optional) failures++;
  } else if (!validate(value)) {
    console.log(`OGILTIG: ${name} — kontrollera typ och format i konfigurationsguiden.`);
    failures++;
  } else {
    console.log(`OK: ${name}`);
  }
}
function validOrigin(value) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.origin === value &&
      (url.protocol === "https:" || (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch {
    return false;
  }
}
check("NEXT_PUBLIC_SUPABASE_URL", validOrigin);
check("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value => {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split(".");
    return parts.length === 3 &&
      JSON.parse(Buffer.from(parts[1], "base64url").toString()).role === "anon";
  } catch {
    return false;
  }
});
check("OPENAI_API_KEY", value => /^sk-[A-Za-z0-9_-]{20,}$/.test(value));
check("OPENAI_MODEL", value => value === "gpt-4.1-mini", true);
check("APP_URL", validOrigin);
if (process.argv.includes("--production") &&
    env.APP_URL !== "https://jarvis-ai-platform.vercel.app") {
  console.log("OGILTIG: APP_URL måste matcha projektets produktionsadress.");
  failures++;
}
const unsafePublicConfig = Object.keys(env).some(name =>
  name.startsWith("NEXT_PUBLIC_") && env[name] &&
  /OPENAI|SERVICE_ROLE|SECRET|PASSWORD|TOKEN|PRIVATE_KEY/.test(name));
if (unsafePublicConfig) {
  console.log("OGILTIG: en hemlig variabel har NEXT_PUBLIC_-prefix. Ta bort exponeringen.");
  failures++;
}
console.log(failures
  ? "Konfigurationen är inte klar. Se docs/PRODUCTION_SETUP.md."
  : "Formatkontrollen passerar. Tjänsteåtkomst och inloggning måste verifieras separat.");
process.exitCode = failures ? 1 : 0;
