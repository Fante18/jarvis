# JARVIS

En responsiv AI-arbetsyta byggd med Next.js App Router, TypeScript, Tailwind CSS, Supabase och OpenAI Agents SDK. Alla åtta sidor finns: Dashboard, AI Agents, Opportunities, Market Intelligence, Sales, Approvals, Ask Jarvis och Settings.

## Starta

Kräver Node.js 22+ och npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Öppna http://localhost:3000. Utan Supabase-konfiguration används **tydligt märkt demodata**. Demoändringar sparas i webbläsarens localStorage och skickas inte till en databas. AI-körningar och fillagring är avstängda i demoläge. Demo och driftdata blandas inte.

## Supabase

1. Skapa ett nytt projekt. Kör `supabase/migrations/001_foundation.sql` sedan `002_hardening.sql` `003_ai_workflows.sql` och `20261017230742_analysis_pipeline.sql` i SQL Editor, alternativt använd Supabase CLI migrationshantering.
2. Ange `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` i `.env.local`. Äldre anon key fungerar också som publishable key.
3. Sätt `APP_URL=http://localhost:3000`. Lägg till `http://localhost:3000/auth/callback` under Authentication → URL Configuration → Redirect URLs. Sätt Site URL till appens URL.
4. Starta om appen, öppna Settings, skapa konto och bekräfta e-post. E-postbekräftelse ska förbli aktiverad. För publik drift: konfigurera egen SMTP och Supabase Auths rate limits/bot-skydd enligt er policy.
5. Inloggade användare börjar med en **tom, privat arbetsyta**. Skapa agent, signal, möjlighet eller lead med sidornas formulär.

Ingen service-role-nyckel behövs. Servern använder användarens autentiserade session; RLS isolerar tabeller och privata filer. Hemligheter ska inte läggas i UI, Git eller variabler med prefixet `NEXT_PUBLIC_`.

## Arkitektur

- `app/`: Next.js-sidor och server-API.
- `components/`: responsivt gränssnitt, formulär, diagram och dialoger.
- `lib/domain.ts`: gemensamma typer, Zod-validering och ekonomiska beräkningar.
- `lib/use-workspace.ts`: explicit demo-/driftläge och datahämtning.
- `lib/server/`: server-only Supabase-klient, autentisering och AI-orkestrering.
- `supabase/migrations/`: tabeller, index, RLS, audit-triggers, beslutsregler och privat Storage-bucket.
- `tests/`: tester för validering, ursprungskontroll, rapportering och databasens säkerhetsregler.

Skrivningar kräver inloggning, kontrollerat Origin, tillåten entitet och strikt Zod-validering. API:t accepterar inte användar-ID från klienten. Beslut skapas som väntande och blir oföränderliga efter godkännande/avslag. En godkänd åtgärd är ett dokumenterat beslut och utför inte externa utskick eller betalningar.

Datahämtning är begränsad till de senaste 200 posterna per entitet och 60 chattmeddelanden. Gränsen gör denna grundversion förutsägbar; inför serverpaginering och separata SQL-aggregat före större datamängder. Dashboardens summeringar avser inlästa poster. Grafen använder skapandedatum för vunna leads, inte fakturering eller bokförd omsättning. Föreslagna värden och poäng är uppskattningar.

## AI-funktioner

Det nya kompletta analysflödet är implementerat: **Scout → Research → Validator → Strategist → Finance → Critic → Jarvis**, med valfri Sales Agent före Critic. Starta och granska det från **Ask Jarvis**, **AI Agents** eller **Opportunities**. Det kör i bakgrunden efter HTTP-svaret, sparar delresultat och kan återupptas efter avbrott. Se [analysmotorns arkitektur, kostnadsgränser, källkontroll och verifiering](docs/ANALYSIS.md).

Rapporter skiljer verifierade ordagranna källcitat från uppskattningar och hypoteser. Finance räknas deterministiskt som hypotetiska scenarier. Slutpoängens fem dimensioner är en prioriteringsmodell. Betalningsvilja är ännu inte empiriskt testad.

Den nya motorn har en förhandsreserverad API-budget ($1.20–$2.00/analys), en låst modell/prisram, begränsade steg och tidsgränser. Befintliga enstaka anpassade agentkörningar nedan bevaras separat med sin äldre riktbudget.

Lägg till `OPENAI_API_KEY` på servern. Standardmodell: `gpt-4.1-mini`; `OPENAI_MODEL` kan ange en annan Responses-kompatibel modell med stöd för webbsökning och strukturerade utdata. Kontrollera behörighet i ert OpenAI-projekt.

Skapa en agent med typ research, opportunity eller sales, aktivera den och välj Kör agent. Agents SDK genomför ett avgränsat uppdrag med ett modellsvar och högst tre inbyggda webbsökningsanrop. Rapporten valideras och sparar högst tre poster av varje typ i en atomisk transaktion. Körhistorik visar tokens, resultat eller fel. Övergivna körningar markeras som misslyckade vid nästa start efter två minuter.

Ask Jarvis använder Responses API med de senaste 12 chattmeddelandena och avgränsad arbetsytedata. Chatten ger råd och ändrar inte data; research startas uttryckligen från AI Agents eller chattens agentväljare. Fråga och svar sparas tillsammans först efter lyckad generering.

Alla AI-anrop kräver verifierad användarsession och begränsas atomiskt i PostgreSQL till 10 per användare/timme. Modelltid begränsas till 50 sekunder, klienten gör inga automatiska omförsök och endast en agentkörning per användare tillåts samtidigt. API-nycklar, e-post och kontaktpersoner tas inte med i arbetsytekontexten. Uppdrag, senaste chatt och avgränsad affärsdata skickas till OpenAI. Responses-lagring och SDK-spårning är avstängda i koden; leverantörens egna datahanteringsvillkor gäller fortfarande.

Tokenbudgeten styr maximal svarslängd och är en **riktbudget, inget hårt kostnadstak**. Indata och webbsökning kan tillföra kostnad. Använd OpenAI-projektets egna användningskontroller för organisatoriska kostnadsgränser. Inga mejl, köp eller investeringar kan utföras av agenterna.

## Privat fillagring

Market Intelligence har ett researchbibliotek för PDF, TXT och CSV, högst 4 MB. Filer sparas under användarens UUID i den privata bucketen `research`. Nedladdningar använder signerade länkar som gäller i 60 sekunder. Filer läses inte automatiskt av AI; det kräver en separat dokumentindexeringspipeline.

## Vercel

1. Importera denna katalog som projektets rot i Vercel. Framework: **Next.js**. Build: `npm run build`.
2. Ange miljövariabler från `.env.example` i Vercels servermiljö. Använd separata Supabase-projekt och OpenAI-budgetar för utveckling/produktion.
3. Sätt `APP_URL` till den exakta produktionsadressen (utan avslutande `/`) och lägg till motsvarande `/auth/callback` i Supabase.
4. Publicera. Kontrollera inloggning med två separata användare, filisolering och ett begränsat AI-uppdrag innan extern lansering.

Inga schemalagda körningar är aktiva. Ingen cron-konfiguration eller säkerhetskritisk projektinställning ändras automatiskt.

## Riktigt tjänstetest

Efter att servernycklar och ett separat befintligt testkontos `JARVIS_TEST_EMAIL`/`JARVIS_TEST_PASSWORD` konfigurerats säkert: `npm run test:live`. Kommandot gör riktiga API-anrop och sparar en analys. Utan dessa variabler rapporterar det ett blockerat test, inte ett godkänt simulerat resultat.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm start
```

Webbläsartester använder systemets Chromium om det finns; annars installera med `npx playwright install chromium`. E2E-sviten startar produktionsservern automatiskt och förutsätter ett färdigt bygge och saknade Supabase-nycklar (demoläge). Kör den i en separat testmiljö.

Testresultat och vad som kunnat verifieras i denna miljö dokumenteras i `VERIFICATION.md`. En lokal byggkontroll ersätter inte integrationstest mot ert Supabase-projekt och er OpenAI-organisation.
