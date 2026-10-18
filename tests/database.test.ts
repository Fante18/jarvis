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
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
const alice = "10000000-0000-4000-8000-000000000001",
  bob = "10000000-0000-4000-8000-000000000002";
const aliceAgent = "20000000-0000-4000-8000-000000000001",
  bobAgent = "20000000-0000-4000-8000-000000000002";
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "authenticated", sub: id }),
  ]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
create role authenticated; create role anon; create role service_role bypassrls; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
insert into auth.users values('${alice}'),('${bob}');
`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
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
      const review = (
        await db.query<{
          id: string;
          status: string;
          action_type: string;
          amount: string;
        }>(
          "select id,status,action_type,amount from public.approvals where source_analysis_id=$1",
          [id],
        )
      ).rows;
      expect(review).toHaveLength(1);
      expect(review[0]).toMatchObject({
        status: "pending",
        action_type: "research",
        amount: "500",
      });
      await expect(
        db.query(
          "update public.approvals set source_analysis_id=null where id=$1",
          [review[0].id],
        ),
      ).rejects.toThrow(/immutable/);
      expect(
        (
          await db.query(
            "select id from public.sales_drafts where user_id=$1",
            [alice],
          )
        ).rows,
      ).toHaveLength(0);
      await asUser(bob);
      expect(
        (
          await db.query(
            "select id from public.approvals where source_analysis_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "insert into public.approvals(user_id,title,description,risk,action_type,source_analysis_id) values($1,'Cross-owner','Invalid','low','research',$2)",
          [bob, id],
        ),
      ).rejects.toThrow(/owner or state mismatch/);
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

async function newOwner() {
  await db.exec("reset role");
  const id = crypto.randomUUID();
  await db.query("insert into auth.users(id) values($1)", [id]);
  await asUser(id);
  return id;
}
async function asWorker() {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)",
  );
  await db.exec("set role service_role");
}
async function createOpportunity(owner: string, title = "Test opportunity") {
  return (
    await db.query<{ id: string }>(
      "insert into public.opportunities(user_id,title,sector,score) values($1,$2,'test',40) returning id",
      [owner, title],
    )
  ).rows[0].id;
}
describe("phase 3 isolation, budgets, approvals and measured outcomes", () => {
  it("reserves a full planned analysis before any AI call and serializes shared budget across features", async () => {
    const owner = await newOwner();
    await db.query(
      "insert into public.automation_controls(user_id,daily_limit_cents,monthly_limit_cents) values($1,200,1000)",
      [owner],
    );
    const id = (
      await db.query<{ id: string }>(
        "insert into public.analysis_jobs(user_id,topic,budget_cents) values($1,'Budget test for market scanning',150) returning id",
        [owner],
      )
    ).rows[0].id;
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select public.budget_usage($1,date_trunc('day',now())) as n",
            [owner],
          )
        ).rows[0].n,
      ),
    ).toBe(1500000);
    await expect(
      db.query("select public.reserve_ai_cost(600000,'chat')"),
    ).rejects.toThrow(/JARVIS_BUDGET_LIMIT/);
    await expect(
      db.query("select public.book_ai_cost($1,gen_random_uuid(),1,'chat')", [
        owner,
      ]),
    ).rejects.toThrow(/permission denied/);
    await db.query(
      "update public.analysis_jobs set status='failed',reserved_microusd=500000 where id=$1",
      [id],
    );
    await db.exec("reset role");
    await db.query(
      "update public.ai_costs set created_at=now()-interval '90 days' where id=$1",
      [id],
    );
    await asUser(owner);
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select public.budget_usage($1,date_trunc('day',now())) as n",
            [owner],
          )
        ).rows[0].n,
      ),
    ).toBe(500000);
    await expect(
      db.query("select public.reserve_ai_cost(1500001,'proposal')"),
    ).rejects.toThrow(/JARVIS_BUDGET_LIMIT/);
    const booking = (
      await db.query<{ id: string }>(
        "select public.reserve_ai_cost(100000,'proposal') as id",
      )
    ).rows[0].id;
    await db.query("select public.settle_ai_cost($1,5000)", [booking]);
    await expect(
      db.query("select public.settle_ai_cost($1,0)", [booking]),
    ).rejects.toThrow(/Invalid settlement/);
  });
  it("queues enabled schedules only once, blocks a forged worker and honors the global pause", async () => {
    const owner = await newOwner();
    await db.query(
      "insert into public.automation_controls(user_id,enabled) values($1,true)",
      [owner],
    );
    const schedule = (
      await db.query<{ id: string }>(
        "insert into public.scan_schedules(user_id,name,topic,interval_days,budget_cents,enabled) values($1,'Weekly','Public workflow market signals',7,150,true) returning id",
        [owner],
      )
    ).rows[0].id;
    await expect(db.query("select public.queue_due_scans()")).rejects.toThrow(
      /permission denied/,
    );
    await asWorker();
    const jobs = (
      await db.query<{ jobs: { id: string; user_id: string }[] }>(
        "select public.queue_due_scans() as jobs",
      )
    ).rows[0].jobs;
    expect(jobs.filter((j) => j.user_id === owner)).toHaveLength(1);
    const job = jobs.find((j) => j.user_id === owner)!;
    expect(
      (
        await db.query<{ jobs: unknown[] }>(
          "select public.queue_due_scans() as jobs",
        )
      ).rows[0].jobs.filter(
        (j) => (j as { user_id: string }).user_id === owner,
      ),
    ).toHaveLength(0);
    await asUser(owner);
    expect(
      (
        await db.query<{ n: number }>(
          "select (extract(epoch from (next_run_at-last_run_at))/86400)::integer as n from public.scan_schedules where id=$1",
          [schedule],
        )
      ).rows[0].n,
    ).toBe(7);
    await db.query(
      "update public.automation_controls set enabled=false where user_id=$1",
      [owner],
    );
    expect(
      (
        await db.query<{ cancel_requested: boolean }>(
          "select cancel_requested from public.analysis_jobs where id=$1",
          [job.id],
        )
      ).rows[0].cancel_requested,
    ).toBe(true);
    await asWorker();
    expect(
      (
        await db.query<{ j: unknown }>(
          "select public.claim_analysis($1,gen_random_uuid()) as j",
          [job.id],
        )
      ).rows[0].j,
    ).toBeNull();
  });
  it("keeps actual cash distinct from won deals, prevents duplicates, preserves corrections and isolates totals", async () => {
    const owner = await newOwner(),
      opp = await createOpportunity(owner);
    const lead = (
      await db.query<{ id: string }>(
        "insert into public.leads(user_id,name,company,value,stage,opportunity_id) values($1,'Person','Company',90000,'won',$2) returning id",
        [owner, opp],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ t: { receipts_cents: number } }>(
          "select public.cash_totals() t",
        )
      ).rows[0].t.receipts_cents,
    ).toBe(0);
    const id = crypto.randomUUID();
    await db.query(
      "insert into public.cash_entries(id,user_id,lead_id,kind,amount_cents,occurred_on,reference) values($1,$2,$3,'receipt',125000,current_date,'INV-100')",
      [id, owner, lead],
    );
    await expect(
      db.query(
        "insert into public.cash_entries(id,user_id,kind,amount_cents,occurred_on,reference) values($1,$2,'receipt',125000,current_date,'INV-100')",
        [crypto.randomUUID(), owner],
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      db.query(
        "update public.cash_entries set amount_cents=900000 where id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    expect(
      (
        await db.query<{ t: { receipts_cents: number } }>(
          "select public.cash_totals() t",
        )
      ).rows[0].t.receipts_cents,
    ).toBe(125000);
    await asUser(bob);
    expect(
      (await db.query("select * from public.cash_entries where id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ t: { receipts_cents: number } }>(
          "select public.cash_totals() t",
        )
      ).rows[0].t.receipts_cents,
    ).toBe(0);
    await asUser(owner);
    await db.query("delete from public.leads where id=$1", [lead]);
    expect(
      (
        await db.query<{ lead_id: string | null }>(
          "select lead_id from public.cash_entries where id=$1",
          [id],
        )
      ).rows[0].lead_id,
    ).toBeNull();
    await db.query(
      "update public.cash_entries set voided_at=now() where id=$1",
      [id],
    );
    expect(
      (
        await db.query<{ t: { receipts_cents: number } }>(
          "select public.cash_totals() t",
        )
      ).rows[0].t.receipts_cents,
    ).toBe(0);
    expect(
      (await db.query("select * from public.cash_entries where id=$1", [id]))
        .rows,
    ).toHaveLength(1);
  });
  it("creates a research lead without inventing a customer, email or deal value and deduplicates conversions", async () => {
    const owner = await newOwner(),
      opp = await createOpportunity(owner);
    const a = (
      await db.query<{ id: string }>(
        "select public.opportunity_to_lead($1) id",
        [opp],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select public.opportunity_to_lead($1) id",
          [opp],
        )
      ).rows[0].id,
    ).toBe(a);
    const lead = (
      await db.query<{ name: string; email: string; value: string }>(
        "select name,email,value from public.leads where id=$1",
        [a],
      )
    ).rows[0];
    expect(lead.name).toBe("Ej identifierad");
    expect(lead.email).toBe("");
    expect(Number(lead.value)).toBe(0);
    await asUser(bob);
    expect(
      (
        await db.query<{ id: null }>(
          "select public.opportunity_to_lead($1) id",
          [opp],
        )
      ).rows[0].id,
    ).toBeNull();
  });
  it("requires the exact reviewed snapshot, real consent and a one-time server claim before an email send", async () => {
    const owner = await newOwner();
    const lead = (
      await db.query<{ id: string }>(
        "insert into public.leads(user_id,name,company,email) values($1,'Real person','Company','recipient@example.com') returning id",
        [owner],
      )
    ).rows[0].id;
    const draft = (
      await db.query<{ id: string }>(
        "insert into public.sales_drafts(user_id,lead_id,subject,body,recipient,content_hash) values($1,$2,'Pilot offer','Specific narrow pilot offer for review','recipient@example.com','test-hash') returning id",
        [owner, lead],
      )
    ).rows[0].id;
    await expect(
      db.query("update public.sales_drafts set status='approved' where id=$1", [
        draft,
      ]),
    ).rejects.toThrow(/draft state transition|approval required/i);
    const approval = (
      await db.query<{ id: string }>(
        "select public.submit_sales_draft($1) id",
        [draft],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "update public.sales_drafts set body='Unreviewed different body' where id=$1",
        [draft],
      ),
    ).rejects.toThrow(/new draft/);
    await db.query(
      "update public.approvals set status='approved',decided_at=now() where id=$1",
      [approval],
    );
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.sales_drafts where id=$1",
          [draft],
        )
      ).rows[0].status,
    ).toBe("approved");
    await asWorker();
    await expect(
      db.query("select public.claim_sales_send($1,$2)", [draft, owner]),
    ).rejects.toThrow(/consent/);
    await asUser(owner);
    await db.query(
      "update public.leads set lawful_basis='consent',consent_record='Consent recorded from actual opt-in form' where id=$1",
      [lead],
    );
    await expect(
      db.query("select public.claim_sales_send($1,$2)", [draft, owner]),
    ).rejects.toThrow(/permission denied/);
    await asWorker();
    expect(
      (
        await db.query<{ d: { id: string } }>(
          "select public.claim_sales_send($1,$2) d",
          [draft, owner],
        )
      ).rows[0].d.id,
    ).toBe(draft);
    expect(
      (
        await db.query<{ d: unknown }>(
          "select public.claim_sales_send($1,$2) d",
          [draft, owner],
        )
      ).rows[0].d,
    ).toBeNull();
    await asUser(owner);
    await expect(
      db.query("update public.sales_drafts set status='draft' where id=$1", [
        draft,
      ]),
    ).rejects.toThrow(/immutable|state transition/);
  });
  it("makes token storage server-only and audit/feedback append-only without leaking contact bodies", async () => {
    const owner = await newOwner(),
      opp = await createOpportunity(owner);
    await db.query(
      "insert into public.outcome_feedback(user_id,opportunity_id,test_reference,sample_size,positive_results,assumption,result,verdict,observed_at) values($1,$2,'pilot-test-1',5,0,'Willingness to pay test','Zero out of five accepted the real paid pilot','refuted',now())",
      [owner, opp],
    );
    await expect(
      db.query(
        "update public.outcome_feedback set verdict='supported' where opportunity_id=$1",
        [opp],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select encrypted_tokens from public.email_connections"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query(
        "insert into public.audit_events(user_id,entity,record_id,action) values($1,'forged','forged','FAKE')",
        [owner],
      ),
    ).rejects.toThrow(/permission denied/);
    const audit = (
      await db.query(
        "select * from public.audit_events where entity='outcome_feedback'",
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("Zero out of five");
    await asUser(bob);
    expect(
      (
        await db.query(
          "select * from public.outcome_feedback where opportunity_id=$1",
          [opp],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
function sqlAnalysisStore(id: string): AnalysisStore {
  const token = crypto.randomUUID();
  const query: typeof db.query = async (
    ...args: Parameters<typeof db.query>
  ) => {
    try {
      return await db.query(...args);
    } catch (e) {
      console.error("Test SQL boundary:", (e as Error).message);
      throw e;
    }
  };
  return {
    async claim() {
      return (
        await query<{ job: AnalysisJob }>(
          "select public.claim_analysis($1,$2) job",
          [id, token],
        )
      ).rows[0].job;
    },
    async reserve(_id, role, b) {
      await query(
        "update public.analysis_jobs set active_role=$1,spent_microusd=$2,reserved_microusd=$3,attempted_calls=$4 where id=$5",
        [role, b.spent, b.reserved, b.calls, id],
      );
    },
    async checkpoint(_id, pos, result, b) {
      await query("select public.checkpoint_analysis($1,$2,$3,$4,$5,$6)", [
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
        await query<{ c: boolean }>(
          "select cancel_requested c from public.analysis_jobs where id=$1",
          [id],
        )
      ).rows[0].c;
    },
    async complete(_id, report, b) {
      await query("select public.finish_analysis($1,$2,$3,$4,$5)", [
        id,
        token,
        JSON.stringify(report),
        b.spent,
        b.reserved,
      ]);
    },
    async fail(_id, status, error, b) {
      await query(
        "update public.analysis_jobs set status=$1,error=$2,spent_microusd=$3,reserved_microusd=$4 where id=$5",
        [status, error, b.spent, b.reserved, id],
      );
    },
  };
}
it("executes scheduled Scout → Jarvis as the scoped worker and merges a repeated business into its existing opportunity", async () => {
  const owner = await newOwner();
  await db.query(
    "insert into public.automation_controls(user_id,enabled) values($1,true)",
    [owner],
  );
  const schedule = (
    await db.query<{ id: string }>(
      "insert into public.scan_schedules(user_id,name,topic,interval_days,budget_cents,enabled) values($1,'Daily','Accounting workflow opportunities',1,150,true) returning id",
      [owner],
    )
  ).rows[0].id;
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  const transport = sdkTransport();
  try {
    let previous: string | null = null;
    for (let i = 0; i < 2; i++) {
      await asWorker();
      const queued = (
        await db.query<{ jobs: { id: string; user_id: string }[] }>(
          "select public.queue_due_scans() jobs",
        )
      ).rows[0].jobs;
      const job = queued.find((j) => j.user_id === owner)!;
      expect(job).toBeTruthy();
      await executeAnalysis(job.id, {
        store: sqlAnalysisStore(job.id),
        loadSignals: async () => sources,
      });
      const result = (
        await db.query<{
          status: string;
          error: string | null;
          opportunity_id: string;
        }>(
          "select status,error,opportunity_id from public.analysis_jobs where id=$1",
          [job.id],
        )
      ).rows[0];
      expect(result.error).toBeNull();
      expect(result.status).toBe("completed");
      if (previous) expect(result.opportunity_id).toBe(previous);
      previous = result.opportunity_id;
      await asUser(owner);
      await db.query(
        "update public.scan_schedules set next_run_at=now()-interval '1 day' where id=$1",
        [schedule],
      );
    }
    expect(transport.calls).toHaveLength(14);
    expect(
      (
        await db.query(
          "select source_analysis_id,status from public.approvals where user_id=$1 and source_analysis_id is not null",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select id from public.sales_drafts where user_id=$1", [
          owner,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select * from public.opportunities where user_id=$1", [
          owner,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.analysis_jobs where user_id=$1 and status='completed'",
          [owner],
        )
      ).rows,
    ).toHaveLength(2);
    const usage = (
      await db.query<{ reserved_microusd: number; state: string }>(
        "select reserved_microusd,state from public.ai_costs where user_id=$1",
        [owner],
      )
    ).rows;
    expect(
      usage.every((r) => r.state === "settled" && r.reserved_microusd === 0),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
it("rejects duplicate measured tests and cross-owner outcome references", async () => {
  const owner = await newOwner(),
    opp = await createOpportunity(owner);
  const query =
    "insert into public.outcome_feedback(user_id,opportunity_id,test_reference,sample_size,positive_results,assumption,result,verdict,observed_at) values($1,$2,'Pilot-unique-1',5,1,'A specific price test','One of five accepted the pilot','inconclusive',now())";
  await db.query(query, [owner, opp]);
  await expect(db.query(query, [owner, opp])).rejects.toThrow(/duplicate key/);
  await asUser(bob);
  await expect(db.query(query, [bob, opp])).rejects.toThrow(/owner mismatch/);
});
