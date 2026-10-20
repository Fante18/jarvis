# Projektet nedstängt — 2026-10-20

Ägaren har avslutat projektet. Cronkonfigurationen tas bort, samtliga appanrop stoppas i Proxy med HTTP 410 och OpenAI-klientens konstruktion spärras av en kodstyrd avstängning. Två avstängningstester och produktionsbygget inklusive typkontroll passerar. Lokal faktisk HTTP-kontroll av `/`, `/api/workspace`, `/api/cron/market-scan` och POST `/api/ai/chat` ger 410 innan API-kod körs. Verifieringsservern är avslutad.

Supabase nekade både SQL-avstängning av scheman och project pause med saknad behörighet. Vercel project pause nekades med 403 för team `fante`. Dessa molnåtgärder har därför inte genomförts. Kod, säkerhetskopia och sparade molndata bevaras. Lokala återskapningsbara beroenden, byggfiler och testartefakter rensas. Se [avstängningsstatus och manuella kontosteg](docs/SHUTDOWN.md).

Nedanstående är historiska verifieringar från utvecklingen, inte aktuell aktiv drift.

---

# Fortsatt affärsflöde — verifiering 2026-10-19

## Första riktiga schemalagda analysen

Läsning av den befintliga produktionsdatabasen bekräftar att `1511d662-06e4-4a8e-a4dd-c0ca67388ee7` kördes automatiskt 2026-10-19 **06:26:09–06:27:06 UTC**. Samtliga sju steg slutfördes utan fel. Beräknad tokenkostnad är **$0.061911**, reservation **$0**. Rapporten sparar 48 källposter, noll kontrollerade källcitat, poäng 6/100 och affärsstatus `research`. Det är ett fungerande riktigt bakgrundsflöde, inte verifierad efterfrågan eller intäkt. Ingen ny betald testkörning startades av denna felsökning.

Rapporten föreslog samtidigt ett komplett affärssystem och ett 90-dagarstest för 50 000 SEK. Instruktionerna förtydligas nu så första testet avgränsas före större utveckling och återstående verktygs-/kompetensberoenden anges. Urvalet till automatiskt granskningsärende kräver ett befintligt test på högst 500 SEK och 14 dagar. Originalets större test och kostnad skrivs inte om. Detta är en gräns för förslag, ingen tilldelad budget eller tillåtelse att spendera pengar.

Modellens motiveringar för poäng 5–7 beskrev mellannivåbedömningar, vilket gör skalvalet otydligt. Instruktioner och schema anger nu uttryckligen 0–100 med kalibreringspunkter. Det är inte bevisat att modellen avsåg en annan skala; historiska poäng bevaras och inga värden räknas upp automatiskt. Nytt modellbeteende behöver följas upp på senare riktiga körningar.

**82 automatiska tester, 19 webbläsarkontroller** och produktionsbygget inklusive TypeScript passerar. Nya regressionstester stoppar ett 50 000 SEK/90-dagarstest, väljer ett redan föreslaget mindre test utan att ändra originalen och bevarar genuint låga poäng. Utdataformatet verifieras genom riktiga SDK-anrop med simulerade HTTP-svar. Browserkontrollerna kördes separat mot en färsk produktionsserver på port 3016 utan återanvändning av gammal server.

## Betalning och produktleverans är blockerade på anslutning

Källkod och listade Vercel-variabelnamn innehåller ingen betalningsimplementation eller Stripe-/Shopify-konfiguration. Detta bevisar inte att ägaren saknar ett konto utanför projektet. Vercels integrationslista nekar team `fante` med **403**. CLI saknar autentisering; både kategorilista och discovery startade inloggning, som avbröts utan att någon identitet eller behörighet ändrades. Ingen integration eller ny Vercel-/Supabase-resurs har skapats.

Den offentliga Marketplace-sidan bekräftar Stripe för en enda köpknapp och stöd för sandbox. Riktig integration behövs före ett byggt och verifierat köp-/leveransflöde. Ingen mock-checkout, betalningsknapp utan funktion, kunddebitering eller automatisk transaktion läggs till. Ägaren behöver ansluta betaltjänsten och ge anslutningen åtkomst till rätt Vercel-team/projekt. Produkt, pris, villkor och offentlig kundåtkomst behöver granskas före liveaktivering. Befintliga Auth-/RLS-/Deployment Protection-inställningar och budgetar är oförändrade.

Ett konkret administrativt mallpaket och en köp-/leveransplan finns privat under `/workspace/jarvis-private-products/`, utanför det publika GitHub-repositoryt. De är utkast för granskning, inte publicerade produkter eller fungerande betalningsintegrationer. Produkt-ZIP:ens integritet är kontrollerad. Underlaget beskriver signerade webhookar, belopps-/valutakontroll, idempotens, skyddad nedladdning och sandbox-prov före godkänd liveaktivering.

---

Nedan är historisk verifiering.

# Automatisk affärsberedning — verifiering 2026-10-18

Nya kompletta Scout–Jarvis-analyser sammanställer ett sparat affärsunderlag från befintliga specialiststeg: avgränsat erbjudande, hypotetiskt månadspris, valideringstest, leveransplan, beläggsstatus, risker och osänd säljtext. Sales Agent-text återanvänds när Sales ingår; annars skapas en uttryckligt märkt generisk mall utan mottagare. Inga extra modellsteg, fejkade kunder eller registrerade intäkter tillkommer.

Fasta regler skickar svaga underlag till research och respekterar avslag från Critic eller Jarvis. Underlag med minst två källor, 50 poäng, ett konkret test, positivt prisantagande och hypotetiskt lönsamt basscenario kan föreslås för granskning. Gränserna motiverar ett test, inte en förväntan om försäljning. Saknad betalningsvalidering, verklig köpare och leveransförmåga anges alltid.

`20261018215634_commercial_reviews.sql` är installerad i befintligt Supabase-projekt. Den atomiska slutpubliceringen skapar ett väntande granskningsärende med oföränderlig källanalys. Två analyser av samma möjlighet ger högst ett väntande ärende men behåller båda rapporterna. Approvals länkar till originalets affärsunderlag och källor. Beslut utför inga tester, köp, utskick eller publiceringar. Den tidigare separata kontrollen för exakt meddelande, samtycke och manuell Gmail-sändning är kvar.

**79 automatiska tester och 19 webbläsarkontroller**, inklusive affärsunderlagets mobilbredd, passerar. TypeScript och Next.js-produktionsbygget passerar. PostgreSQL kör alla sex migrationsfiler; verkliga Agents SDK-koden med simulerade HTTP-svar slutför två schemalagda analyser, en möjlighet, ett väntande granskningsärende och noll säljutkast. Testerna kontrollerar även källcitat utan påhittad betalningshistorik, Critics veto, saknade belägg/ekonomi/test, låst källreferens och nekad koppling över ägargränsen. Inga nya modellsteg krävs (sju anrop per normal analys).

Katalogfråga i riktig databas bekräftar källkolumn, installerad trigger, invoker-funktion, ingen anonym EXECUTE och fortsatt RLS. Security Advisors ger samma fyra varningskategorier som före migrationen, inga nya. Ingen säkerhetskritisk Auth-, RLS- eller Deployment Protection-inställning ändras. Alla 23 befintliga apptabeller är kvar; inga nya projekt skapas.

Riktig driftstatus vid kontrollen: **1 aktiverat dagligt schema**, **$1.50/analys**, central automatisering **på**, **$2/dag och $10/månad**, **0 schemalagda körningar**, **0 anslutna mejlkonton**. Det tidigare avklippta offentliga sökområdet (499 tecken, avslutat mitt i en mening) ersattes med en komplett version på 477 tecken inom samma el-/VVS-inriktning. Frekvens, aktivering, budget och körtid ändrades inte. Tidigare **1 komplett riktig analys och 1 möjlighet** är kvar; inga granskningsärenden skapades från gamla rapporter.

En riktig schemalagd körning med det nya underlaget återstår att verifiera efter publicering. Vercels skyddade HTTP-/loggkontroll har senast nekats med 403; inga privata nycklar hämtas för att kringgå detta. Verklig kundprodukt, försäljning, betalningsflöde och leverans är inte implementerade av denna avgränsade utökning. Ursprunglig kodbackup har fortsatt SHA256 `51ee6147163c6fc81d2ca7af1b62f37b1e3ea5ab21af038a8e862ae3a9463559`.

---

Nedan följer historiska verifieringar med den konfiguration som gällde vid respektive kontroll.

# Serverkonfiguration — tidigare verifiering 2026-10-18

Den tidigare konfigurationskontrollen accepterade bara moderna `sb_secret_`-nycklar, trots att Supabase även stöder aktiverade äldre `service_role`-JWT. Båda formaten stöds nu; public/anon- och vanliga användarnycklar avvisas. Formatvalidering ersätter inte autentisering: den inloggade inställningssidan verifierar serverbehörighet med ett ägaravgränsat HEAD-anrop utan att hämta datarader. Timeout är fem sekunder och status kan återanvändas i högst 30 sekunder.

Konfigurationsfel skiljer nu mellan saknat värde, fel format, för kort cron-hemlighet, blanksteg/radbrytningar och nekad serveranslutning. Endast statiska meddelanden och variabelnamn returneras; inga nyckelvärden eller råa leverantörsfel. Gmail-statusfel blockerar inte längre automatiseringsinställningar och sparade budgetar. Central paus fungerar även med felaktig serverkonfiguration. Inga Auth-/RLS-/Deployment Protection-inställningar ändras.

**75 automatiska tester**, **19 olika webbläsarkontroller**, TypeScript och produktionsbygget passerar. Browserproven kördes mot en färsk server på port 3014: 18 prov passerade i helkörningen; det nya provet fick en korrigerad väntan på sparbekräftelsen och passerade sedan separat. Mobilprovet verifierar specifikt felmeddelande, fortsatt åtkomst när Gmail-status misslyckas, paus och ny konfigurationskontroll. Nya serverprov använder verklig Supabase-klient med simulerade HTTP-svar; ingen privat produktionsnyckel eller betald AI-körning används.

Vercels metadata bekräftar att `SUPABASE_SECRET_KEY`, `CRON_SECRET` och `OPENAI_API_KEY` finns som Sensitive i Production. Användarens ompublicering av `db7507f` är READY och gjordes efter att variablerna lades till. **Värdenas riktighet är inte verifierad** genom denna metadata. Den tidigare generiska feltexten fastställer inte vilken variabel som är felaktig. Extern sidkontroll och byggloggar nekas av Vercel-anslutningen med 403; åtkomstskyddet behålls. Det nya beskedet i Settings behöver kontrolleras med användarens inloggade session efter publicering.

Läsning av produktionsdatabasen bekräftar **central automatisering aktiverad**, **$2/dag**, **$10/månad** och **0 skanningsscheman**. Inga budgetsiffror, scheman eller data ändras i denna rättning. Ursprunglig backup har fortsatt SHA256 `51ee6147163c6fc81d2ca7af1b62f37b1e3ea5ab21af038a8e862ae3a9463559`. Källkontrollen hittade inga privata miljöfiler eller credential-mönster bland de 110 granskade filerna före denna dokumentuppdatering.

---

Nedan följer historiska verifieringar med den konfiguration som gällde vid respektive kontroll.

# Steg 3 — tidigare verifiering 2026-10-18

## Genomfört

- Schemalagda marknadsskanningar (dagligen/veckovis), central paus, atomisk gemensam dags-/månadsbudget, cache av offentlig research och dubblettmatchning av möjligheter.
- Sparade dagliga sammanfattningar, aktiva körningar på dashboard, CRM-koppling från möjlighet till research-lead, uppföljningar, säljförslag, låsta godkännanden och separat manuell Gmail-sändning.
- Heltalsbaserade registrerade betalningar/återbetalningar/kostnader, historik med makulering, kassaflöde från händelsedatum och oföränderliga testutfall med stickprov, unika referenser och begränsad prioriteringsjustering.
- Gmail OAuth-kod använder PKCE, användarbundet state, HttpOnly-cookie, AES-256-GCM och bara nödvändig sändbehörighet. Ingen verklig OAuth-anslutning eller sändning gjordes.

## Kontroller som passerar

**69 automatiska tester**, **18 webbläsartester**, TypeScript och Next.js-produktionsbygge. Browserkontroller kördes mot en separat färsk produktionsserver på port 3013 med återanvändning av server avstängd.

PostgreSQL/PGlite kör alla fem riktiga migrationsfiler och verifierar ägarisolering, gemensam budget före AI-anrop, kvarhållna osäkra reservationer över periodskiften, schemaläggarens åtkomst och paus, betalda utfall separat från vunna affärsvärden, dubblettskydd för betalningar/tester och låst godkännandesnapshot. Hela schemalagda Scout–Jarvis-kedjan körs två gånger genom riktiga Agents SDK och PostgreSQL med simulerade OpenAI-HTTP-svar. Resultatet är en möjlighet och två kompletta analyser med bevarad historik. Ett saknat service-role SELECT-grant för befintlig agent_runs-kontroll upptäcktes och rättades i detta test.

Sales-provet kör riktiga OpenAI SDK mot simulerat HTTP-svar och bekräftar kompatibelt utdataformat, reservation före anrop, avsaknad av externa verktyg, budgetstopp utan modellförfrågan och ingen automatisk retry vid osäkert fel. OAuth-tester avvisar manipulerat state, fel användare och utgången callback innan tokenutbyte; kryptering och MIME-injektion kontrolleras. UI-proven sparar schema, ekonomiskt utfall och osänt säljutkast, testar budget-/integrationsspärrar samt mobilbredd.

## Riktig databas och bevarad grund

`20261018155013_automation_and_crm.sql` är installerad i befintligt Supabase-projekt `yqzdkzwwqanwzeslmxtd`. Namnet matchar verklig remote-version. Alla **23 tabeller** har RLS. Katalogkontrollen visar: anon/authenticated saknar SELECT på mejltokens; anon saknar budget- och worker-RPC; authenticated saknar worker-kö, sändningsclaim och direkt INSERT i audit-loggen. Service-rollen har avsedd worker-åtkomst.

Före och efter migrationen: **1 slutförd riktig analys, 34 sparade källor och 1 möjlighet**. Inga test-leads, påhittade betalningar eller testanalyser skapades i produktionsdatabasen. Tidigare analysers sparade kostnad/reservation importerades till budgethistoriken. **0 scheman och 0 aktiverade automatiseringar**. Ursprunglig kodbackup `/workspace/jarvis-source.zip` har oförändrad SHA256 `51ee6147163c6fc81d2ca7af1b62f37b1e3ea5ab21af038a8e862ae3a9463559`.

Den första riktiga analysen slutfördes före steg 3 med användarens produktionssession: sju steg, beräknat $0.060721 och kvarvarande osäker reservation $0.50 från det tidigare felet. De 18 påståendena är inte markerade som verifierade. Detta bevisar en fungerande riktig grundkedja, inte validerad efterfrågan eller intäkt.

## Aktivering och återstående livekontroller

Vercel Production innehåller OpenAI-nyckel, publik Supabase-konfiguration, APP_URL och gpt-4.1-mini. Vid kontrollen saknas **SUPABASE_SECRET_KEY och CRON_SECRET** samt de frivilliga Gmail-variablerna. Nycklar har inte lästs eller skrivits ut. Schemaläggningen kan därför inte aktiveras ännu. Exakta manuella steg finns i [PHASE3.md](docs/PHASE3.md).

Innan verklig automatisering: lägg servervariabler i samma Vercel-projekt, publicera om, välj frekvens/budget och aktivera själv. Verifiera en faktisk cron-körning, kostnadsbokning och sammanfattning med den riktiga inloggningen. Gmail behöver Google OAuth-konfiguration, anslutning och ett konkret godkänt provmeddelande. Inga mejl, köp eller betalningar utfördes i denna utvecklingsomgång.

Vercels befintliga Deployment Protection och Supabase Auth har inte ändrats. Extern automatiserad produktionswebbläsare och runtime-loggar har tidigare nekats med HTTP 403; lokal browserkontroll och Vercel READY är inte samma sak som verifierad produktionsinloggning efter denna ändring.

## Security Advisor

Efter migrationen: inga nya anonyma SECURITY DEFINER-anrop. Informationsrad om email_connections utan policies är avsiktlig deny-by-default. Inloggades två nya budget-RPC är avsiktliga och ägarskaps-/beloppskontrollerade; interna definers har inga klientgrants. Befintliga varningar om plattformsfunktionen rls_auto_enable, reserve_ai_request och avstängt skydd mot läckta lösenord kvarstår. Inga säkerhetskritiska projektinställningar ändras automatiskt. Se [granskningen och åtgärdslänkarna](docs/PRODUCTION_SETUP.md#granskning-av-säkerhetsråd).

---

Nedanstående är äldre historiska verifieringar. Aktuell status står överst.

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
