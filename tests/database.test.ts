import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  executeAnalysis,
  type AnalysisStore,
} from "../lib/server/analysis/orchestrator";
import type { AnalysisJob } from "../lib/analysis/contracts";
import { sdkTransport } from "./helpers/analysis-transport";
import { sources, fixtureJob, fixtureOutput } from "./fixtures/analysis";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
const alice = "10000000-0000-4000-8000-000000000001",
  bob = "10000000-0000-4000-8000-000000000002";
const aliceAgent = "20000000-0000-4000-8000-000000000001",
  bobAgent = "20000000-0000-4000-8000-000000000002";
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
create role authenticated; create role anon; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
insert into auth.users values('${alice}'),('${bob}');
`);
  for (const file of [
    "001_foundation.sql",
    "002_hardening.sql",
    "003_ai_workflows.sql",
    "20261017230742_analysis_pipeline.sql",
  ]) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  }
  await db.exec(
    `insert into public.agents(id,user_id,name,description,kind) values('${aliceAgent}','${alice}','Alice agent','','research'),('${bobAgent}','${bob}','Bob agent','','sales')`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe("PostgreSQL row isolation and constraints", () => {
  it("persists the complete actual-SDK workflow through PostgreSQL transactions and publishes one scored opportunity", async () => {
    await asUser(alice);
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const transport = sdkTransport();
    const token = "40000000-0000-4000-8000-000000000001";
    const created = await db.query<{ id: string }>(
      "insert into public.analysis_jobs(user_id,topic,budget_cents) values($1,'Accounting workflow opportunities',150) returning id",
      [alice],
    );
    const id = created.rows[0].id;
    const store: AnalysisStore = {
      async claim() {
        return (
          await db.query<{ job: AnalysisJob }>(
            "select public.claim_analysis($1,$2) as job",
            [id, token],
          )
        ).rows[0].job;
      },
      async reserve(_id, role, b) {
        await db.query(
          "update public.analysis_jobs set active_role=$1,spent_microusd=$2,reserved_microusd=$3,attempted_calls=$4 where id=$5",
          [role, b.spent, b.reserved, b.calls, id],
        );
      },
      async checkpoint(_id, pos, result, b) {
        await db.query("select public.checkpoint_analysis($1,$2,$3,$4,$5,$6)", [
          id,
          token,
          pos,
          JSON.stringify(result),
          b.spent,
          b.reserved,
        ]);
      },
      async cancelled() {
        return (
          await db.query<{ c: boolean }>(
            "select cancel_requested as c from public.analysis_jobs where id=$1",
            [id],
          )
        ).rows[0].c;
      },
      async complete(_id, report, b) {
        await db.query("select public.finish_analysis($1,$2,$3,$4,$5)", [
          id,
          token,
          JSON.stringify(report),
          b.spent,
          b.reserved,
        ]);
      },
      async fail(_id, status, error, b) {
        await db.query(
          "update public.analysis_jobs set status=$1,error=$2,spent_microusd=$3,reserved_microusd=$4 where id=$5",
          [status, error, b.spent, b.reserved, id],
        );
      },
    };
    try {
      await executeAnalysis(id, { store, loadSignals: async () => sources });
      const job = (
        await db.query<AnalysisJob>(
          "select * from public.analysis_jobs where id=$1",
          [id],
        )
      ).rows[0];
      expect(job.error).toBeNull();
      expect(job.status).toBe("completed");
      expect(
        (
          await db.query<{ step_count: number }>(
            "select step_count from public.analysis_summaries where id=$1",
            [id],
          )
        ).rows[0].step_count,
      ).toBe(7);
      expect(job.results.map((r) => r.role)).toEqual([
        "scout",
        "research",
        "validator",
        "strategist",
        "finance",
        "critic",
        "jarvis",
      ]);
      expect(job.report?.scorecard.total).toBe(74);
      expect(
        (
          await db.query(
            "select * from public.analysis_steps where analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(7);
      expect(
        (
          await db.query(
            "select * from public.analysis_sources where analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (
          await db.query(
            "select * from public.analysis_claims where analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(14);
      const opp = (
        await db.query<{ score: number; value: string }>(
          "select score,value from public.opportunities where origin_analysis_id=$1",
          [id],
        )
      ).rows;
      expect(opp).toHaveLength(1);
      expect(opp[0].score).toBe(74);
      expect(Number(opp[0].value)).toBe(0);
      expect(transport.calls).toHaveLength(7);
      await asUser(bob);
      expect(
        (
          await db.query(
            "select * from public.analysis_summaries where id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.analysis_jobs where id=$1", [id]))
          .rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from public.analysis_steps where analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from public.analysis_sources where analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query<{ job: unknown }>(
            "select public.claim_analysis($1,$2) as job",
            [id, token],
          )
        ).rows[0].job,
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it("rejects out-of-order checkpoints, incomplete publication and foreign analysis references", async () => {
    await asUser(alice);
    const r = await db.query<{ id: string }>(
      "insert into public.analysis_jobs(user_id,topic,budget_cents) values($1,'Another analysis topic',150) returning id",
      [alice],
    );
    const id = r.rows[0].id,
      token = "40000000-0000-4000-8000-000000000002";
    await db.query("select public.claim_analysis($1,$2)", [id, token]);
    await expect(
      db.query("select public.checkpoint_analysis($1,$2,$3,$4,$5,$6)", [
        id,
        token,
        1,
        JSON.stringify({ role: "research" }),
        0,
        0,
      ]),
    ).rejects.toThrow(/step order/);
    await expect(
      db.query("select public.finish_analysis($1,$2,$3,$4,$5)", [
        id,
        token,
        JSON.stringify({}),
        0,
        0,
      ]),
    ).rejects.toThrow(/incomplete/);
    await asUser(bob);
    await expect(
      db.query(
        "insert into public.analysis_sources(user_id,analysis_id,source_key,url,title,provider,retrieved_at) values($1,$2,'fake','https://example.com','Foreign','test',now())",
        [bob, id],
      ),
    ).rejects.toThrow(/belong to record owner/);
    await asUser(alice);
    await db.query(
      "update public.analysis_jobs set status='failed' where id=$1",
      [id],
    );
  });

  it("persists a validated report atomically and completes only the owned run", async () => {
    await asUser(alice);
    const r = await db.query<{ id: string }>(
      "insert into public.agent_runs(user_id,agent_id,status) values($1,$2,'running') returning id",
      [alice, aliceAgent],
    );
    const report = {
      summary: "Research complete",
      signals: [],
      opportunities: [
        {
          title: "Validated draft",
          description: "Hypothesis",
          sector: "AI",
          score: 80,
          value: 10000,
          source_url: "",
        },
      ],
      approvals: [
        {
          title: "Review draft",
          description: "Human review",
          risk: "low",
          action_type: "research",
          amount: 0,
        },
      ],
    };
    await db.query("select public.complete_agent_run($1,$2,$3)", [
      r.rows[0].id,
      JSON.stringify(report),
      200,
    ]);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.agent_runs where id=$1",
          [r.rows[0].id],
        )
      ).rows[0].status,
    ).toBe("completed");
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.approvals where title='Review draft'",
        )
      ).rows[0].status,
    ).toBe("pending");
    await expect(
      db.query("select public.complete_agent_run($1,$2,$3)", [
        r.rows[0].id,
        JSON.stringify(report),
        200,
      ]),
    ).rejects.toThrow(/Active run not found/);
  });
  it("rolls back all draft writes when any report row violates a constraint", async () => {
    await asUser(alice);
    const r = await db.query<{ id: string }>(
      "insert into public.agent_runs(user_id,agent_id,status) values($1,$2,'running') returning id",
      [alice, aliceAgent],
    );
    const bad = {
      summary: "Invalid",
      signals: [
        {
          title: "Must roll back",
          description: "Test",
          sector: "AI",
          strength: "high",
          source_url: "https://example.com",
        },
      ],
      opportunities: [
        {
          title: "Invalid",
          description: "Test",
          sector: "AI",
          score: 101,
          value: 0,
        },
      ],
      approvals: [],
    };
    await expect(
      db.query("select public.complete_agent_run($1,$2,$3)", [
        r.rows[0].id,
        JSON.stringify(bad),
        1,
      ]),
    ).rejects.toThrow(/check constraint/);
    expect(
      (
        await db.query(
          "select * from public.signals where title='Must roll back'",
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(bob);
    await expect(
      db.query("select public.complete_agent_run($1,$2,$3)", [
        r.rows[0].id,
        JSON.stringify({ ...bad, signals: [], opportunities: [] }),
        1,
      ]),
    ).rejects.toThrow(/Active run not found/);
    await asUser(alice);
    await db.query("update public.agent_runs set status='failed' where id=$1", [
      r.rows[0].id,
    ]);
  });
  it("stores both chat messages together and keeps other accounts isolated", async () => {
    await asUser(alice);
    await db.query("select public.save_chat_exchange($1,$2)", [
      "My question",
      "My answer",
    ]);
    expect((await db.query("select * from public.messages")).rows).toHaveLength(
      2,
    );
    await asUser(bob);
    expect((await db.query("select * from public.messages")).rows).toHaveLength(
      0,
    );
  });

  it("allows owner CRUD while hiding other tenants", async () => {
    await asUser(alice);
    const rows = await db.query<{ name: string }>(
      "select name from public.agents",
    );
    expect(rows.rows.map((r) => r.name)).toEqual(["Alice agent"]);
    const r = await db.query<{ id: string }>(
      `insert into public.leads(user_id,name,company,value,stage) values($1,'Alice','Test',1500,'new') returning id`,
      [alice],
    );
    const id = r.rows[0].id;
    await db.query("update public.leads set stage='won' where id=$1", [id]);
    expect(
      (
        await db.query<{ stage: string }>(
          "select stage from public.leads where id=$1",
          [id],
        )
      ).rows[0].stage,
    ).toBe("won");
    await db.query("delete from public.leads where id=$1", [id]);
    expect(
      (await db.query("select * from public.leads where id=$1", [id])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.activities")).rows.length,
    ).toBeGreaterThanOrEqual(4);
  });
  it("blocks forged ownership and foreign updates", async () => {
    await asUser(alice);
    await expect(
      db.query(
        "insert into public.leads(user_id,name,company) values($1,'Forged','Other')",
        [bob],
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      (
        await db.query(
          "update public.agents set name='Hacked' where id=$1 returning id",
          [bobAgent],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("update public.agents set user_id=$1 where id=$2", [
        bob,
        aliceAgent,
      ]),
    ).rejects.toThrow(/row-level security/);
  });
  it("keeps approvals pending on create and immutable after a decision", async () => {
    await asUser(alice);
    await expect(
      db.query(
        "insert into public.approvals(user_id,title,description,risk,status,action_type,decided_at) values($1,'Bypass','Test','low','approved','research',now())",
        [alice],
      ),
    ).rejects.toThrow(/must start pending/);
    const r = await db.query<{ id: string }>(
      "insert into public.approvals(user_id,title,description,risk,action_type) values($1,'Review','Test','low','research') returning id",
      [alice],
    );
    await db.query(
      "update public.approvals set status='approved',decided_at=now() where id=$1",
      [r.rows[0].id],
    );
    await expect(
      db.query("update public.approvals set status='rejected' where id=$1", [
        r.rows[0].id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query("delete from public.approvals where id=$1 returning id", [
        r.rows[0].id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("rejects cross-tenant agent references", async () => {
    await asUser(alice);
    await expect(
      db.query(
        "insert into public.agent_runs(user_id,agent_id,status) values($1,$2,'running')",
        [alice, bobAgent],
      ),
    ).rejects.toThrow(/belong to run owner/);
  });
  it("enforces per-user AI rate limits atomically", async () => {
    await asUser(alice);
    for (let i = 0; i < 10; i++) {
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select public.reserve_ai_request() as ok",
          )
        ).rows[0].ok,
      ).toBe(true);
    }
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.reserve_ai_request() as ok",
        )
      ).rows[0].ok,
    ).toBe(false);
    await asUser(bob);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.reserve_ai_request() as ok",
        )
      ).rows[0].ok,
    ).toBe(true);
  });
  it("isolates private research objects by user folder", async () => {
    await asUser(alice);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('research',$1)",
      [`${alice}/test.txt`],
    );
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values('research',$1)",
        [`${bob}/forged.txt`],
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(bob);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await asUser(alice);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
  });
});
