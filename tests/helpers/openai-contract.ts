import { expect } from "vitest";

// OpenAI Structured Outputs supports this explicit set of string formats.
// URL validity and lengths are enforced by the original Zod schema after generation.
// https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas
export function expectOpenAICompatibleSchema(schema: unknown) {
  const formats = new Set([
    "date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid",
  ]);
  const violations: string[] = [];
  function visit(value: unknown, path: string) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.format === "string" && !formats.has(node.format))
      violations.push(`${path}.format=${node.format}`);
    if ("minLength" in node || "maxLength" in node)
      violations.push(`${path}: unsupported string length keyword`);
    if (node.type === "object" && node.properties) {
      expect(node.additionalProperties).toBe(false);
      expect(Array.isArray(node.required)).toBe(true);
      expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties).sort());
    }
    for (const [key, child] of Object.entries(node)) visit(child, `${path}.${key}`);
  }
  visit(schema, "schema");
  expect(violations).toEqual([]);
}
