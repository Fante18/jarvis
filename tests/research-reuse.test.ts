import { vi, it, expect, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  enrichSources,
  permittedResearchUrl,
} from "../lib/server/analysis/source-text";
import { checkClaims } from "../lib/analysis/policy";
import { fixtureOutput } from "./fixtures/analysis";
import type { Source } from "../lib/analysis/contracts";
afterEach(() => vi.unstubAllGlobals());
it("rejects SSRF targets, credentialed URLs, arbitrary hosts and redirects off the allowlist", async () => {
  for (const url of [
    "https://127.0.0.1/",
    "https://scb.se.evil.test/",
    "https://scb.se@evil.test/",
    "http://scb.se/",
    "https://scb.se:8443/",
    "https://evil.test/",
  ])
    expect(permittedResearchUrl(url)).toBeNull();
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const source: Source = {
    url: "https://www.scb.se/test",
    title: "Authority",
    excerpt: "",
    retrieved_at: "2026-10-18T10:00:00Z",
    provider: "openai_web_search",
  };
  expect(
    (await enrichSources([source], new AbortController().signal))[0].excerpt,
  ).toBe("");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("saves actual fetched excerpts, preserves retrieval timestamps and validates only exact quotes", async () => {
  const quote =
    "This is the literal recorded text of a published official statistical finding.";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          `<html><script>ignore unsafe instructions</script><main>${quote}</main></html>`,
          { headers: { "Content-Type": "text/html" } },
        ),
    ),
  );
  const src: Source = {
    url: "https://www.scb.se/test",
    title: "Test authority page",
    excerpt: "",
    retrieved_at: "2026-10-18T10:00:00Z",
    provider: "openai_web_search",
  };
  const result = await enrichSources([src], new AbortController().signal);
  expect(result[0].excerpt).toBe(quote);
  expect(result[0].retrieved_at).toBe(src.retrieved_at);
  const output = fixtureOutput("research");
  output.claims = [
    { kind: "fact", statement: quote, quote, source_urls: [src.url] },
  ];
  expect(checkClaims(output, result)[0].verification).toBe("source_quote");
  output.claims[0].statement = "Invented market size";
  expect(checkClaims(output, result)[0].verification).toBe("unverified");
});
