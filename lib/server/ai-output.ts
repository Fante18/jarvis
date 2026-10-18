import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { JsonSchemaDefinition } from "@openai/agents";
import type { z } from "zod";

const supportedFormats = new Set([
  "date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid",
]);

/** Keep Zod validation intact while sending only OpenAI's supported schema subset. */
export function openAIOutput(schema: z.ZodType): JsonSchemaDefinition {
  const wire = structuredClone(zodTextFormat(schema, "output").schema);
  function normalize(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    // Zod emits formats such as starts_with/uri that the Responses API rejects.
    // Local schema.parse still enforces full URLs, prefixes and string lengths.
    if (typeof node.format === "string" && !supportedFormats.has(node.format))
      delete node.format;
    delete node.minLength;
    delete node.maxLength;
    for (const map of [node.properties, node.$defs, node.definitions])
      if (map && typeof map === "object") Object.values(map).forEach(normalize);
    for (const child of [node.items, node.additionalProperties]) normalize(child);
    for (const choices of [node.anyOf, node.allOf, node.oneOf])
      if (Array.isArray(choices)) choices.forEach(normalize);
  }
  normalize(wire);
  return { type: "json_schema", name: "output", strict: true, schema: wire as JsonSchemaDefinition["schema"] };
}
