# Scout-felsökning — 2026-10-18

Den första riktiga analysen startade men misslyckades efter ett försök, med noll färdiga steg. Databasen innehåller en reservation på $0.50 och ingen rapporterad tokenkostnad. Reservationen är inte en bekräftad debitering. Det ursprungliga API-felet sparades tyvärr som ett generellt meddelande; Vercels runtime-loggar nekas med HTTP 403 och CLI saknar autentisering. Därför är det exakta ursprungliga leverantörsfelet inte bekräftat.

Ett konkret kodfel reproducerades i de riktiga SDK-genererade HTTP-anropen: Zod emitterar `format: starts_with` för HTTPS-källor, vilket inte ingår i OpenAI Structured Outputs [tillåtna format](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas). Den nya serveradaptern skickar bara tillåtna format och lämnar stränglängd/URL-validering till oförändrade Zod-scheman efter modellsvaret. Både analyskedjan och äldre enstaka agenter använder adaptern. Två kontraktkontroller misslyckades före rättningen och passerar efter den.

Säkra felkategorier för nyckel, behörighet, kvot, rate limit, modell, schema, timeout, nätverk och ogiltigt utdata sparas nu. Endast godkända status-/felkoder och validerat request-ID loggas; råa leverantörsmeddelanden, nycklar och indata loggas inte. Ett SDK-test med HTTP 429 verifierar att insufficient_quota sparas begripligt, att rå feltext inte läcker, att inga automatiska omförsök sker och att kostnadsreservationen behålls.

49 automatiska tester, 12 webbläsarkontroller, typkontroll och produktionsbygge passerar. Browserkontrollerna kördes mot en separat server på port 3012, så en äldre server inte kunde återanvändas av misstag. Tre tester hade hårdkodad port i Origin-headern; de använder nu den verkliga testadressen och passerar med bibehållna kontroller av främmande ursprung. Ingen betald analys eller budgetåterställning utförs automatiskt. Fullständig riktig Scout-till-Jarvis-körning behöver fortfarande verifieras med användarens session efter publicering.

# Driftförberedelser — historik 2026-10-18

- GitHub-kopplingen från `Fante18/jarvis` till befintligt Vercel-projekt `jarvis-ai-platform` är bekräftad genom Vercels repository-filter.
- Befintligt Supabase-projekt `jarvis` (`yqzdkzwwqanwzeslmxtd`) är ACTIVE_HEALTHY. De fyra befintliga migrationerna installerades utan ändrat SQL-innehåll. Lokala filnamn matchar verkliga migrationsversioner; gamla namn finns i `docs/PRODUCTION_SETUP.md` och ursprunglig backup bevaras.
- Katalogkontroll i riktiga databasen: 14 apptabeller med RLS, ägarpolicies, `security_invoker=true` på sammanställningsvyn och privat research-bucket. Anonymt läsanrop mot riktiga Data API nekades med HTTP 401.
- Riktigt läsanrop till Auth settings gav HTTP 200: e-postinloggning och registrering tillåtna, e-postbekräftelse krävs. Ingen användare skapades och inget mejl skickades. Site URL/Redirect URLs återstår att kontrollera manuellt.
- Fyra produktionsvariabler är inlagda i Vercel: Supabase URL/publishable key, APP_URL och OPENAI_MODEL. Inga hemliga värden är incheckade eller utskrivna. OPENAI_API_KEY saknas fortfarande.
- Konfigurationskontrollens fall för saknade värden, giltiga format, hemlighetsredigering, privat Supabase-nyckel, fel modell och publikt exponerad hemlighet passerar.
- Förnyad lokal kontroll: 36 Vitest-tester, 12 Chromium-tester, typkontroll och produktionsbygge passerar. `npm run test:live` avbröts uttryckligen på saknad OPENAI_API_KEY före nätverksanrop.
- Supabase Security Advisors varningar om SECURITY DEFINER-funktioner är granskade och dokumenterade i driftguiden. Behörigheter för Supabases egen event-trigger eller projektets Auth/Deployment Protection har inte ändrats.
- Ny kontroll av skyddad produktions-HTTP via Vercel-anslutningen nekades med 403. Detta bevisar en åtkomstbegränsning, inte att appens HTTP-flöde passerar. Extern inloggning/CRUD behöver verifieras med riktig användarsession.

Ett komplett betalt Scout-till-Jarvis-test har fortfarande **inte** körts mot OpenAI. Använd aktiveringsstegen i [driftguiden](docs/PRODUCTION_SETUP.md). Nedanstående resultat från 2026-10-17 är historik, inte aktuella uppgifter om anslutna resurser.

# Analysmotor — historisk verifiering 2026-10-17

- **36 automatiska data-, integritets-, SDK- och PostgreSQL-tester passerar.**
- **12 Chromium-tester passerar** mot produktionsbygget, inklusive direktlänk till sparad analys, poängkort, källor, ekonomiska scenarier, hela specialistkedjans historik, konfigurationsgränser och de gamla CRUD-funktionerna.
- Typkontroll och Next.js-produktionsbygge passerar.
- Komplett Scout → Research → Validator → Strategist → Finance → Critic → Jarvis-flöde är verifierat med riktiga Agents SDK-koden och **simulerade OpenAI-HTTP-svar**, samt genom PostgreSQL-transaktioner i PGlite. Sales, budgetstopp, kvarhållna osäkra kostnadsreservationer, återupptagning, stoppbegäran och falska faktapåståenden testas.
- Alla fyra migrationer körs i PostgreSQL-testdatabasen. Ägarskap, stegordning och atomisk slutpublicering verifieras. Scenariobelopp skrivs inte som verklig intäkt eller verkligt affärsvärde.
- Det riktiga offentliga Hacker News/Algolia-API:t svarade med två faktiska källposter vid ett avgränsat test (`query=accounting`). Detta verifierar datakällans åtkomst, inte någon marknadshypotes.

**Live-testet är blockerat, inte godkänt:** `npm run test:live` avslutas med `LIVE TEST BLOCKED: OPENAI_API_KEY saknas`. Körmiljön saknar servernycklar, Vercel-projektets miljövariabellista var tom och Supabase-anslutningen listade inga projekt. Ingen komplett analys har därför ännu verifierats mot riktiga OpenAI- och Supabase-tjänster. Inga kundintervjuer eller betalningstester har utförts.

Konfigurera tjänsterna och de fyra migrationerna enligt README och `docs/ANALYSIS.md`, samt ett befintligt separat testkonto för live-testet. Befintligt Vercel-åtkomstskydd och externa säkerhets-/faktureringsinställningar har inte ändrats.

## Tidigare grundsystemets verifiering

# Verifiering

Verifierat 2026-10-17 i arbetsmiljön med Node.js 24 och Chromium.

- 20 Vitest-tester passerar: 7 domän-/valideringstester, 9 PostgreSQL-tester och 4 AI-kontrakt-/SDK-tester.
- PostgreSQL-sviten använder PGlite och kör samtliga tre migrationer mot en isolerad testdatabas. Supabase Auth och Storage-scheman emuleras; RLS, triggers och transaktioner körs i riktig PostgreSQL.
- AI-testet kör riktiga OpenAI Agents SDK mot ett simulerat HTTP-svar. Det verifierar strukturerat utdataformat, verktygsgränser, tokenrapportering, `store: false`, avstängd tracing och avvisning av ogiltiga modellsvar. Det är inte ett riktigt OpenAI-anrop.
- 9 Playwright-tester passerar mot produktionsbygget: åtta sidors navigation, lead-CRUD och pipeline, persistenta beslut, saknade integrationer, mobilsökning och meny, API-ursprungskontroll, responsiv layout, chattens agentuppdrag och AI-API-validering.
- `npm run typecheck` passerar.
- `npm run build` passerar med Next.js 16.4.2.
- Skärmbilder: `artifacts/jarvis-dashboard.png` och `artifacts/jarvis-mobile.png`.

## Ej verifierat med riktiga tjänster

Supabase-inloggning, Storage och OpenAI-anrop har inte integrationstestats mot riktiga projekt eftersom inga projekt-/API-nycklar är konfigurerade i appen. Dessa flöden är implementerade; konfigurera tjänsterna enligt README och verifiera med två separata konton innan drift med verklig data.

Schemalagda agentkörningar, automatisk outreach, investeringar och dokumentindexering är inte aktiverade. Godkännanden är dokumenterade beslut och utför inga externa åtgärder.

## Publicering

Vercel-projekt: `jarvis-ai-platform` (`prj_vJP2UbiusnDN6eSGttiKKRX4hWqv`). En demopublicering skapades från samma testade källfiler. Vercels befintliga SSO-/Deployment Protection behölls. Den separata filuppladdnings-API:n nekade teamåtkomst med 403; publicering via projektets ordinarie direkta deployment-API accepterades. Slutstatus och URL kontrolleras separat hos Vercel.

Vercel har bekräftat **READY** för deployment `dpl_Yui2HqxTudfmdv8xVg8oSGpGKqaP`.

- Fast projektadress: https://jarvis-ai-platform.vercel.app
- Exakt deployment: https://jarvis-ai-platform-a90qo2c91-fante.vercel.app
- Miljö: production, tydligt märkt demoläge.
- Vercels befintliga åtkomstskydd behölls.

Efterkontroll av HTTP-sidan via Vercel-anslutningen blockerades med 403 vid läsning av Deployment Protection. READY-statusen är verifierad, men sidans externa HTTP-svar har därför inte verifierats. Använd Vercel-kontots befintliga inloggning för åtkomst.

## Analysmotorns publicerade version

Vercel bekräftade READY för `dpl_7pCqgV2MnbPM8JfgRfxNw7VGbm1P`.

- https://jarvis-ai-platform-7i8zvecnr-fante.vercel.app
- Stabil projektadress: https://jarvis-ai-platform.vercel.app
- Miljö: production, fortsatt konfigurations-/demoläge utan servernycklar.

Vercels befintliga åtkomstskydd behölls. Online-statusen är verifierad hos Vercel; extern HTTP-/SSO-verifiering är inte genomförd för den nya versionen. Den tidigare anslutningen nekade skyddad HTTP-åtkomst med 403. Den nya koden har verifierats lokalt i Chromium. Riktigt modell-/Supabase-test återstår enligt blockeraren ovan.
