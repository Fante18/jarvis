import { vi, expect } from "vitest";
import { specialists, type AgentRole } from "../../lib/analysis/contracts";
import { sources, fixtureOutput } from "../fixtures/analysis";
export function sdkTransport(failRole?: AgentRole) {
  const calls: AgentRole[] = [];
  const mock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const role = (Object.keys(specialists) as AgentRole[]).find((r) =>
      String(body.instructions).includes(specialists[r].task),
    )!;
    calls.push(role);
    if (role === failRole) throw new Error("Ambiguous provider failure");
    const web = specialists[role].web;
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(2200);
    if(web){expect(JSON.stringify(body)).not.toContain('Private user context');expect(JSON.stringify(body)).not.toContain('Private lead record');}
    if (web) expect(body.max_tool_calls).toBe(1);
    else expect(body.tools || []).toHaveLength(0);
    if (role !== "scout")
      expect(JSON.stringify(body.input)).toContain(
        "scout: isolated test analysis",
      );
    return new Response(
      JSON.stringify({
        id: "resp_" + role,
        object: "response",
        created_at: 1,
        status: "completed",
        model: "gpt-4.1-mini",
        output: [
          ...(web
            ? [
                {
                  id: "search_" + role,
                  type: "web_search_call",
                  status: "completed",
                  action: {
                    type: "search",
                    query: "public topic",
                    sources: [
                      {
                        type: "url",
                        url: sources[0].url,
                        title: sources[0].title,
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: "msg_" + role,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(fixtureOutput(role)),
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 150,
          total_tokens: 250,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}
