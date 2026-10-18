import { test, expect, type Page } from "@playwright/test";
import { emptyWorkspace } from "../../lib/domain";
import { defaultControls } from "../../lib/automation";
const leadId = "60000000-0000-4000-8000-000000000001",
  oppId = "60000000-0000-4000-8000-000000000002",
  draftId = "60000000-0000-4000-8000-000000000003";
async function setup(page: Page) {
  const w = emptyWorkspace();
  w.leads = [
    {
      id: leadId,
      created_at: new Date().toISOString(),
      name: "Known contact",
      company: "Verified input AB",
      email: "contact@example.com",
      value: 90000,
      stage: "won",
      notes: "User-provided data",
    },
  ];
  w.opportunities = [
    {
      id: oppId,
      created_at: new Date().toISOString(),
      title: "Test business opportunity",
      description: "Test hypothesis",
      sector: "Test sector",
      score: 45,
      value: 0,
      status: "new",
      source_url: "",
      verified_evidence_count: 0,
    },
  ];
  const automation = {
    controls: defaultControls,
    worker_configured: false,
    schedules: [] as unknown[],
    daily_microusd: 60721,
    monthly_microusd: 60721,
    audit: [],
    feedback: [] as Record<string, unknown>[],
    calibration: { samples: 0, supported: 0, refuted: 0, adjustment: 0 },
    digest: {
      day: "2026-10-18",
      generated_at: new Date().toISOString(),
      findings: [],
      completed: 0,
      failed: 0,
      pending_approvals: 0,
      followups: 0,
      note: "Test-fixture summary",
    },
  };
  const crm = {
    cash: [] as Record<string, unknown>[],
    drafts: [] as Record<string, unknown>[],
    totals: { receipts_cents: 0, refunds_cents: 0, costs_cents: 0 },
    trend: [],
  };
  const requests: { path: string; body: Record<string, any> }[] = [];
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: { supabase: true, openai: true, model: "gpt-4.1-mini" },
    }),
  );
  await page.route("**/api/workspace", (r) =>
    r.fulfill({
      json: {
        data: w,
        user: { id: "test", email: "user@example.com" },
        settings: {
          workspace_name: "Test workspace",
          focus_sectors: "Test",
          currency: "SEK",
        },
      },
    }),
  );
  await page.route("**/api/ai/analyses", (r) =>
    r.fulfill({ json: { analyses: [] } }),
  );
  await page.route("**/api/integrations/gmail", (r) =>
    r.fulfill({ json: { configured: false, email: null } }),
  );
  await page.route("**/api/automation*", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      requests.push({ path: "automation", body: b });
      if (b.action === "controls") automation.controls = b.controls;
      if (b.action === "schedule")
        automation.schedules.push({
          ...b.schedule,
          id: crypto.randomUUID(),
          next_run_at: new Date().toISOString(),
          last_run_at: null,
          last_error: null,
        });
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: automation });
  });
  await page.route("**/api/crm", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      requests.push({ path: "crm", body: b });
      if (b.action === "cash") {
        crm.cash.unshift({
          ...b.entry,
          created_at: new Date().toISOString(),
          voided_at: null,
        });
        crm.totals.receipts_cents += b.entry.amount_cents;
      }
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: crm });
  });
  return { w, automation, crm, requests };
}
test("prepares a weekly scan while missing worker credentials keep automatic execution disabled", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings");
  await expect(
    page.getByLabel("Tillåt schemalagda analyser inom budgeten"),
  ).toBeDisabled();
  await page
    .getByLabel("Namn på skanningen")
    .fill("Swedish accounting signals");
  await page
    .getByLabel("Offentligt sökområde")
    .fill("Public evidence of administrative accounting problems");
  await page.getByLabel("Frekvens").selectOption("7");
  await page.getByRole("button", { name: "Skapa schema", exact: true }).click();
  await expect(
    page.getByText("Swedish accounting signals", { exact: true }),
  ).toBeVisible();
  expect(
    f.requests.find((r) => r.body.action === "schedule")?.body.schedule,
  ).toMatchObject({ interval_days: 7, enabled: false, budget_cents: 150 });
  await page.getByLabel("Dagsbudget för AI (USD)").fill("5");
  await page
    .getByRole("button", { name: "Spara budget och automatisering" })
    .click();
  expect(
    f.requests.find((r) => r.body.action === "controls")?.body.controls,
  ).toMatchObject({ daily_limit_cents: 500, enabled: false });
  await expect(
    page.getByRole("button", { name: "Anslut Gmail", exact: true }),
  ).toBeDisabled();
});
test("records an actual payment separately from won deal value and renders the dashboard totals", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/sales");
  await page
    .getByRole("button", { name: "Registrera ekonomiskt utfall" })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Belopp i SEK").fill("1250.50");
  await d
    .getByLabel("Unik referens, exempelvis fakturanummer")
    .fill("INV-REAL-01");
  await d
    .getByRole("button", { name: "Registrera utfall", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  const saved = f.requests.find((r) => r.body.action === "cash")!.body.entry;
  expect(saved.amount_cents).toBe(125050);
  expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto("/");
  const card = page
    .locator(".ops-stats>.panel")
    .filter({ hasText: "Registrerade inbetalningar, netto" });
  await expect(card.locator("strong")).toContainText("1 251");
  await expect(
    page.getByText("Vunnet affärsvärde", { exact: true }).first(),
  ).toBeVisible();
});
test("saves an unsent draft and routes it to human approval without calling a send endpoint", async ({
  page,
}) => {
  const f = await setup(page);
  let sent = 0;
  await page.route("**/api/crm/drafts", async (r) => {
    const b = r.request().postDataJSON();
    f.crm.drafts.push({
      ...b,
      id: draftId,
      status: "draft",
      recipient: "contact@example.com",
      approval_id: null,
      created_at: new Date().toISOString(),
      error: null,
    });
    return r.fulfill({ json: { id: draftId } });
  });
  await page.route(`**/api/crm/drafts/${draftId}`, (r) => {
    const b = r.request().postDataJSON();
    if (b.action === "send") sent++;
    if (b.action === "request_approval") f.crm.drafts[0].status = "pending";
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/sales");
  await page.getByRole("button", { name: "Förbered säljförslag" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Ämne", { exact: true }).fill("A narrow pilot proposal");
  await d
    .getByLabel("Meddelande", { exact: true })
    .fill("A specific offer based only on known information. Please review.");
  await d.getByRole("button", { name: "Spara utkast för granskning" }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole("button", { name: /A narrow pilot proposal/ }).click();
  await page.getByRole("button", { name: "Begär godkännande" }).click();
  await expect(
    page.getByRole("button", { name: /Väntar på godkännande/ }),
  ).toBeVisible();
  expect(sent).toBe(0);
});
test("mobile operations settings and CRM forms stay within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Marknadsskanningar & budget" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.goto("/sales");
  await page
    .getByRole("button", { name: "Registrera ekonomiskt utfall" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});
test("new mutation endpoints reject foreign origins and the cron never runs without secure configuration", async ({
  request,
  baseURL,
}) => {
  for (const path of [
    "/api/automation",
    "/api/crm",
    "/api/crm/drafts",
    "/api/integrations/gmail/start",
  ]) {
    const bad = await request.post(path, {
      headers: { Origin: "https://evil.example" },
      data: {},
    });
    expect(bad.status()).toBe(403);
  }
  const cron = await request.get("/api/cron/market-scan");
  expect(cron.status()).toBe(503);
  const body = await cron.json();
  expect(body.error).toContain("serverkonfiguration");
  const noUser = await request.post("/api/automation", {
    headers: { Origin: new URL(baseURL!).origin },
    data: {
      action: "controls",
      controls: {
        enabled: true,
        daily_limit_cents: 200,
        monthly_limit_cents: 200,
      },
    },
  });
  expect(noUser.status()).toBe(503);
});

test("measured feedback changes priority while verified evidence stays first and model scores stay intact", async ({
  page,
}) => {
  const f = await setup(page);
  f.automation.feedback.push(
    ...Array.from({ length: 5 }, (_, i) => ({
      id: crypto.randomUUID(),
      opportunity_id: oppId,
      analysis_id: null,
      test_reference: `test-${i}`,
      sample_size: 1,
      positive_results: 1,
      verdict: "supported",
      assumption: "A paid pilot assumption",
      result: "One measured positive result",
      evidence_url: "",
      observed_at: new Date().toISOString(),
    })),
  );
  f.w.opportunities.push({
    ...f.w.opportunities[0],
    id: "60000000-0000-4000-8000-000000000009",
    title: "A source-backed opportunity",
    score: 20,
    verified_evidence_count: 2,
  });
  await page.goto("/opportunities");
  const cards = page.locator(".opportunity-card");
  await expect(cards.first()).toContainText("A source-backed opportunity");
  const measured = cards.filter({ hasText: "Test business opportunity" });
  await expect(measured.locator(".opportunity-score>strong")).toHaveText(
    "55/100",
  );
  await expect(measured).toContainText("Modellpoäng 45");
  await expect(measured.locator(".opportunity-score>div>span")).toHaveAttribute(
    "style",
    /width: 55%/,
  );
});
