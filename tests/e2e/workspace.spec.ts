import { expect, test } from "@playwright/test";
test("dashboard and every workspace page render without broken navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard." })).toBeVisible();
  await expect(
    page.getByText(
      "Exempeldata · ändringar sparas i den här webbläsaren. Inga AI-agenter körs.",
    ),
  ).toBeVisible();
  for (const [name, path] of [
    ["AI Agents", "/agents"],
    ["Opportunities", "/opportunities"],
    ["Market Intelligence", "/intelligence"],
    ["Sales", "/sales"],
    ["Approvals", "/approvals"],
    ["Ask Jarvis", "/chat"],
    ["Settings", "/settings"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: `${name}.`, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("demo lead create, pipeline move, edit, persistence and delete", async ({
  page,
}) => {
  await page.goto("/sales");
  await page.getByRole("button", { name: "Ny lead", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kontaktperson").fill("Test User");
  await dialog.getByLabel("Företag").fill("E2E Labs");
  await dialog.getByLabel("Affärsvärde (SEK)").fill("25000");
  await dialog
    .getByRole("button", { name: "Spara i demo", exact: true })
    .click();
  const card = page.locator(".lead-card").filter({ hasText: "E2E Labs" });
  await expect(card).toBeVisible();
  await card.getByRole("combobox").selectOption("proposal");
  await expect(
    page.locator(".pipeline-proposal").getByText("E2E Labs"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".pipeline-proposal").getByText("E2E Labs"),
  ).toBeVisible();
  await page
    .locator(".lead-card")
    .filter({ hasText: "E2E Labs" })
    .getByRole("button", { name: "Ta bort E2E Labs" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ta bort", exact: true })
    .click();
  await expect(page.getByText("E2E Labs")).toHaveCount(0);
});
test("approval decision persists and cannot be repeated", async ({ page }) => {
  await page.goto("/approvals");
  const first = page.locator(".approval-card").first();
  await first.getByRole("button", { name: "Godkänn", exact: true }).click();
  await expect(first.getByText("Godkänd", { exact: true })).toBeVisible();
  await expect(
    first.getByRole("button", { name: "Godkänn", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .locator(".approval-card")
      .first()
      .getByText("Godkänd", { exact: true }),
  ).toBeVisible();
});
test("missing integrations block AI rather than faking results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Starta analys", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Anslut Supabase och OPENAI_API_KEY", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Starta komplett analys" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stäng", exact: true }).last().click();
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Meddelande till Jarvis" })
    .fill("Analysera min pipeline");
  await expect(
    page.getByRole("button", { name: "Skicka meddelande" }),
  ).toBeDisabled();
});
test("search and responsive mobile navigation work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.locator("nav").getByRole("link", { name: "AI Agents" }).click();
  await expect(page.getByRole("heading", { name: "AI Agents." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sök i arbetsytan" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("redovisning");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: /AI-automation för redovisningsbyråer/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("API refuses unauthenticated mutations and foreign origins", async ({
  request,
}) => {
  const config = await request.get("/api/config");
  expect((await config.json()).supabase).toBe(false);
  const foreign = await request.post("/api/records/leads", {
    headers: { origin: "https://foreign.example" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  const body = {
    name: "User",
    company: "Test",
    email: "",
    value: 0,
    stage: "new",
    notes: "",
  };
  const missing = await request.post("/api/records/leads", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: body,
  });
  expect(missing.status()).toBe(503);
});
test("desktop and mobile dashboard layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  await page.goto("/");
  await expect(
    page.getByText(
      "Exempeldata · ändringar sparas i den här webbläsaren. Inga AI-agenter körs.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/jarvis-dashboard.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/jarvis-mobile.png",
    fullPage: true,
  });
});
test("a chat instruction can be reviewed as an agent job without fabricated execution", async ({
  page,
}) => {
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Meddelande till Jarvis" })
    .fill("Undersök möjligheter inom hållbar logistik");
  await page
    .getByRole("combobox", { name: "Välj agent för chattuppdrag" })
    .selectOption({ label: "Market Scout" });
  await page.getByRole("button", { name: "Granska & kör uppdrag" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Uppdrag" })).toHaveValue(
    "Undersök möjligheter inom hållbar logistik",
  );
  await expect(
    dialog.getByRole("button", { name: "Starta körning" }),
  ).toBeDisabled();
});
test("AI endpoints validate jobs and reject unconfigured execution", async ({
  request,
}) => {
  const headers = { origin: "http://127.0.0.1:3000" };
  const invalid = await request.post("/api/ai/run", {
    headers,
    data: { agent_id: "bad", prompt: "x" },
  });
  expect(invalid.status()).toBe(400);
  const missing = await request.post("/api/ai/run", {
    headers,
    data: {
      agent_id: "00000000-0000-4000-8000-000000000001",
      prompt: "Undersök en marknad",
    },
  });
  expect(missing.status()).toBe(503);
  const chat = await request.post("/api/ai/chat", {
    headers,
    data: { message: "Analysera min pipeline" },
  });
  expect(chat.status()).toBe(503);
});
test("Jarvis exposes all specialist roles and an honest configuration gate in chat", async ({
  page,
}) => {
  await page.goto("/agents");
  for (const role of [
    "Scout Agent",
    "Research Agent",
    "Validator Agent",
    "Strategist Agent",
    "Finance Agent",
    "Critic Agent",
    "Sales Agent",
  ])
    await expect(
      page.locator(".specialist-strip").getByText(role, { exact: false }),
    ).toBeVisible();
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Meddelande till Jarvis" })
    .fill("Undersök AI-automation för redovisningsbyråer");
  await page
    .getByRole("button", { name: "Starta affärsanalys", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Offentligt sökområde")).toHaveValue(
    "Undersök AI-automation för redovisningsbyråer",
  );
  await expect(
    dialog.getByRole("button", { name: "Starta komplett analys" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Ingen AI-analys simuleras i demoläge.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Anslut Supabase och OPENAI_API_KEY", { exact: false }),
  ).toBeVisible();
});
test("analysis endpoints enforce validation, request origin and missing backend configuration", async ({
  request,
}) => {
  const headers = { origin: "http://127.0.0.1:3000" };
  expect((await request.get("/api/ai/analyses")).status()).toBe(503);
  expect(
    (
      await request.post("/api/ai/analyses", {
        headers: { origin: "https://foreign.example" },
        data: { topic: "Valid topic for research", budget_cents: 150 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/ai/analyses", {
        headers,
        data: { topic: "short", budget_cents: 999 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/ai/analyses", {
        headers,
        data: {
          topic: "Valid topic for research",
          budget_cents: 150,
          include_sales: false,
        },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/ai/analyses/bad-id", {
        headers,
        data: { action: "cancel" },
      })
    ).status(),
  ).toBe(400);
});
