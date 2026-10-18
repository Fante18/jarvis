import "server-only";
import OpenAI from "openai";
import { ZodError } from "zod";

export type AIDiagnostic = {
  category: "authentication" | "permission" | "quota" | "rate_limit" | "model" |
    "schema" | "request" | "timeout" | "network" | "provider" | "output" | "unknown";
  message: string;
  status?: number;
  code?: string;
  requestId?: string;
};
const knownCodes = new Set([
  "invalid_api_key", "insufficient_permissions", "insufficient_quota",
  "billing_hard_limit_reached", "billing_not_active", "rate_limit_exceeded",
  "model_not_found", "invalid_json_schema", "invalid_function_parameters",
  "unsupported_parameter", "unsupported_value", "invalid_value",
]);
const messages: Record<AIDiagnostic["category"], string> = {
  authentication: "OpenAI nekade API-nyckeln. Kontrollera OPENAI_API_KEY i Vercel Production och publicera om.",
  permission: "OpenAI nekade behörighet. Kontrollera att nyckeln får skapa Responses och använda gpt-4.1-mini.",
  quota: "OpenAI rapporterar slut på API-kvot eller saldo. Kontrollera Billing och användningsgränsen i samma OpenAI-projekt som nyckeln tillhör. ChatGPT-abonnemanget inkluderar inte API-saldo.",
  rate_limit: "OpenAI:s anrops- eller tokengräns är nådd. Vänta och kontrollera projektets rate limits innan du återupptar.",
  model: "OpenAI kunde inte nå den begärda modellen. Kontrollera projektets åtkomst till gpt-4.1-mini.",
  schema: "OpenAI avvisade analysens svarsschema. Detta är ett formatfel i appens AI-anrop.",
  request: "OpenAI avvisade AI-anropets parametrar. Kontrollera appens API-konfiguration.",
  timeout: "Tidsgränsen för agentsteget uppnåddes. Sparade steg finns kvar; anropet kan ha debiterats.",
  network: "Anslutningen till OpenAI avbröts. Anropet kan ha debiterats; kostnadsreservationen behålls.",
  provider: "OpenAI rapporterade ett serverfel. Sparade steg och kostnadsreservationen finns kvar.",
  output: "Modellsvar kunde inte valideras mot analysens format. Ingen ofullständig slutrapport har sparats.",
  unknown: "Agentsteget kunde inte slutföras. Sparade steg finns kvar. Ingen specifik OpenAI-felorsak kunde fastställas.",
};

/** Never return raw messages, request bodies, headers, credentials or model output. */
export function diagnoseAIError(error: unknown): AIDiagnostic {
  let cause = error;
  for (let i = 0; i < 4; i++) {
    if (cause instanceof OpenAI.APIError || cause instanceof ZodError) break;
    if (!(cause instanceof Error) || !cause.cause) break;
    cause = cause.cause;
  }
  let category: AIDiagnostic["category"] = "unknown";
  let status: number | undefined;
  let code: string | undefined;
  let requestId: string | undefined;
  if (cause instanceof OpenAI.APIConnectionTimeoutError) category = "timeout";
  else if (cause instanceof OpenAI.APIConnectionError) category = "network";
  else if (cause instanceof OpenAI.APIError) {
    status = cause.status;
    code = cause.code && knownCodes.has(cause.code) ? cause.code : undefined;
    requestId = cause.requestID && /^req_[A-Za-z0-9_-]{1,120}$/.test(cause.requestID)
      ? cause.requestID : undefined;
    if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(code || "")) category = "quota";
    else if (status === 401 || code === "invalid_api_key") category = "authentication";
    else if (status === 403) category = "permission";
    else if (status === 429) category = "rate_limit";
    else if (code === "model_not_found" || status === 404) category = "model";
    else if (code === "invalid_json_schema" || code === "invalid_function_parameters" ||
      (status === 400 && /^(?:text\.format|response_format)(?:\.|$)/.test(cause.param || ""))) category = "schema";
    else if (status === 400 || status === 422) category = "request";
    else if (status === 408) category = "timeout";
    else if (status && status >= 500) category = "provider";
  } else if (cause instanceof ZodError || (cause instanceof Error &&
    ["ModelBehaviorError", "MaxTurnsExceededError"].includes(cause.name))) category = "output";
  else if (cause instanceof Error && ["AbortError", "TimeoutError"].includes(cause.name)) category = "timeout";
  const detail = [status ? `HTTP ${status}` : "", code || ""].filter(Boolean).join(", ");
  return { category, message: messages[category] + (detail ? ` (${detail})` : ""), status, code, requestId };
}
