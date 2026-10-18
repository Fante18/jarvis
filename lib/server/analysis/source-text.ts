import "server-only";
import type { Source } from "@/lib/analysis/contracts";
// Only named public statistical/authority sites. No user-supplied hosts, intranet URLs or open redirects.
const domains = [
  "scb.se",
  "tillvaxtverket.se",
  "verksamt.se",
  "bolagsverket.se",
  "skatteverket.se",
  "riksbank.se",
  "ec.europa.eu",
  "data.europa.eu",
];
export function permittedResearchUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      domains.some((d) => u.hostname === d || u.hostname === `www.${d}`)
      ? u
      : null;
  } catch {
    return null;
  }
}
export function sourceText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}
export async function enrichSources(
  sources: Source[],
  signal: AbortSignal,
): Promise<Source[]> {
  const targets = sources
    .filter((s) => !s.excerpt && permittedResearchUrl(s.url))
    .slice(0, 2);
  const enriched = await Promise.all(
    targets.map(async (s) => {
      try {
        let url = permittedResearchUrl(s.url)!;
        const timed = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
        let response: Response | undefined;
        for (let i = 0; i < 3; i++) {
          response = await fetch(url, {
            signal: timed,
            redirect: "manual",
            headers: {
              Accept: "text/html,text/plain,application/json",
              "User-Agent": "JarvisResearch/1.0",
            },
          });
          if (response.status >= 300 && response.status < 400) {
            const next = permittedResearchUrl(
              new URL(response.headers.get("location") || "", url).href,
            );
            await response.body?.cancel();
            if (!next) return s;
            url = next;
            response = undefined;
            continue;
          }
          break;
        }
        if (
          !response?.ok ||
          !response.body ||
          !/(text\/html|text\/plain|application\/json)/i.test(
            response.headers.get("content-type") || "",
          ) ||
          Number(response.headers.get("content-length") || 0) > 512000
        ) {
          await response?.body?.cancel();
          return s;
        }
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const r = await reader.read();
            if (r.done) break;
            size += r.value.byteLength;
            if (size > 512000) {
              await reader.cancel();
              return s;
            }
            chunks.push(r.value);
          }
        } finally {
          reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
        return { ...s, excerpt: sourceText(new TextDecoder().decode(bytes)) };
      } catch {
        return s;
      }
    }),
  );
  const byUrl = new Map(enriched.map((s) => [s.url, s]));
  return sources.map((s) => byUrl.get(s.url) || s);
}
