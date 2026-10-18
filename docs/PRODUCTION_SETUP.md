# Aktivera befintliga JARVIS

**Aktuell status 2026-10-18:** OpenAI-nyckeln är inlagd och en riktig analys med sju steg och 34 källor är slutförd. För automatisering, CRM och Gmail OAuth, följ [steg 3-guiden](PHASE3.md). Grundinställningarna nedan behålls som referens.

Använd dessa befintliga resurser. Skapa inga nya projekt:

- GitHub: https://github.com/Fante18/jarvis, branch `main`.
- Vercel: `jarvis-ai-platform`, projekt-ID `prj_vJP2UbiusnDN6eSGttiKKRX4hWqv`.
- App: https://jarvis-ai-platform.vercel.app.
- Supabase: `jarvis`, projektref `yqzdkzwwqanwzeslmxtd`, region `eu-west-1`.

## Databasen är förberedd

Följande migrationer installerades i det befintliga projektet 2026-10-18:

| Version                                | Innehåll                                                           | Tidigare filnamn                       |
| -------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `20261018124548_foundation.sql`        | Grundtabeller, RLS, rate limit och privat Storage                  | `001_foundation.sql`                   |
| `20261018124550_hardening.sql`         | Beslutsregler, ägarskap och explicita grants                       | `002_hardening.sql`                    |
| `20261018124551_ai_workflows.sql`      | Agentkörningar, atomisk rapport och chatt                          | `003_ai_workflows.sql`                 |
| `20261018124552_analysis_pipeline.sql` | Analysjobb, specialiststeg, källor, påståenden och sammanställning | `20261017230742_analysis_pipeline.sql` |

Steg 3 installerade även `20261018155013_automation_and_crm.sql` i samma projekt. Nu har samtliga 23 apptabeller RLS. Grundmigrationerna ovan ska fortfarande inte köras om.

De fyra ursprungliga migrationernas sQL-innehållet är oförändrat. Filnamnen matchar Supabase-projektets verkliga migrationshistorik, så framtida CLI-migrationer inte försöker installera grunden en gång till. Kör inte dessa filer igen i produktion. Alla 14 apptabeller har RLS, sammanställningsvyn använder `security_invoker=true` och `research`-bucketen är privat. Ursprunglig källkodsbackup finns kvar i `/workspace/jarvis-source.zip`.

## Miljövariabler i Vercel

Öppna https://vercel.com/fante/jarvis-ai-platform/settings/environment-variables. Välj **Production**. Nyare Vercel kallar typerna **Config** och **Secret**; äldre gränssnitt kallar Secret för **Sensitive**.

| Variabel                               | Värde eller var det hämtas                                               | Typ        | Status                                      |
| -------------------------------------- | ------------------------------------------------------------------------ | ---------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://yqzdkzwwqanwzeslmxtd.supabase.co`                               | Config     | Inlagd                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Befintlig aktiv `sb_publishable_...` från Supabase → Settings → API Keys | Config     | Inlagd; värdet skrivs inte ut i guiden      |
| `APP_URL`                              | `https://jarvis-ai-platform.vercel.app` utan avslutande snedstreck       | Config     | Inlagd                                      |
| `OPENAI_MODEL`                         | `gpt-4.1-mini`                                                           | Config     | Inlagd                                      |
| `OPENAI_API_KEY`                       | OpenAI-projektets privata API-nyckel, se nedan                           | **Secret** | Inlagd av användaren; inget värde skrivs ut |

Supabase-inställningarna kan även hämtas från projektets Connect-dialog: https://supabase.com/dashboard/project/yqzdkzwwqanwzeslmxtd?showConnect=true. Använd **publishable**-nyckeln. Manuella grundfunktioner behöver ingen servernyckel, databaslösenord, `DATABASE_URL` eller Supabase access token. Den nya frivilliga bakgrundsarbetaren och Gmail-servern använder `SUPABASE_SECRET_KEY` enligt steg 3-guiden. Lägg aldrig sådana värden i `NEXT_PUBLIC_*`.

Production-nycklarna har inte lagts i Preview eller Development. Använd separata utvecklingsuppgifter när de miljöerna ska aktiveras; inga nya projekt skapas automatiskt. Utan Supabase-konfiguration fortsätter Preview att använda märkt demodata.

## Det du behöver göra i OpenAI

1. Logga in på https://platform.openai.com och välj det projekt som ska betala för JARVIS.
2. Kontrollera API-betalning/saldo under Billing. ChatGPT-abonnemanget inkluderar inte API-användningen.
3. Skapa en privat projekt-API-nyckel på https://platform.openai.com/api-keys. Spara den direkt som `OPENAI_API_KEY` i Vercel, **Production**, typ **Secret**. Skicka aldrig nyckeln till chatten eller GitHub.
4. Om du använder en begränsad nyckel: tillåt att skapa Responses (`POST /v1/responses`) och ge projektet åtkomst till `gpt-4.1-mini` med inbyggd webbsökning. Inga separata sök-, SMTP- eller Sales-nycklar behövs för första analysflödet.
5. Granska projektets användningskontroller. Applikationens analysbudget är $1.20–$2.00, standard $1.50, med reservation före anrop. Leverantörens budgetvarningar behöver inte vara hårda faktureringsstopp. Inga faktureringsinställningar ändras av appen.

## Supabase Auth: kontrollera manuellt

Öppna https://supabase.com/dashboard/project/yqzdkzwwqanwzeslmxtd/auth/url-configuration:

- **Site URL:** `https://jarvis-ai-platform.vercel.app`
- **Redirect URLs:** `https://jarvis-ai-platform.vercel.app/auth/callback`

Det läsande anropet till Supabase Auths settings-endpoint bekräftade att e-postinloggning är aktiverad, registrering är tillåten och e-postbekräftelse krävs (`mailer_autoconfirm=false`). Behåll bekräftelsen aktiverad. Site URL och tillåtna Redirect URLs kan inte läsas genom den tillgängliga anslutningen och behöver kontrolleras manuellt. De säkerhetskritiska Auth-inställningarna har inte ändrats. Standardmallen för bekräftelse via Supabase ConfirmationURL stöds av den befintliga PKCE-callbacken; bekräfta i samma webbläsare där registreringen startades. Appen hanterar `code` på `/auth/callback`, inte en egen `token_hash`-mall.

Supabases inbyggda e-posttjänst kan begränsa mottagare till organisationens medlemmar och har låg sändningskvot. Börja med ägarkontots e-post. Om leveransen nekas, granska Auth-loggarna och konfigurera egen SMTP före bredare registrering. Lösenordet för ett JARVIS-konto är separat från databaslösenordet och Supabase-dashboardens inloggning; appen kräver minst 12 tecken.

## Publicera och kontrollera

1. När `OPENAI_API_KEY` är sparad: gå till Vercel → Deployments och välj **Redeploy** för senaste lyckade publicering från `main`. Miljöändringar kräver en ny publicering. Behåll befintligt Deployment Protection.
2. Öppna appen och logga vid behov in i Vercels åtkomstskydd. I JARVIS → Settings ska Supabase visas som konfigurerat och OpenAI som tillgängligt. `/api/config` visar bara booleska statusvärden och modellnamn.
3. Skapa ett JARVIS-konto, bekräfta e-post i samma webbläsare och logga in. Arbetsytan ska börja tom. Skapa/ändra/radera en egen lead och kontrollera att den finns kvar efter omladdning. Logga ut och logga in igen.
4. Öppna Ask Jarvis → Starta affärsanalys. Välj ett offentligt sökområde, behåll $1.50 i budget och lämna Sales avstängd för första testet. Följ Scout → Research → Validator → Strategist → Finance → Critic → Jarvis.
5. Kontrollera sparade källor, specialiststeg och slutrapport efter omladdning. Poängen prioriterar fortsatt arbete; kundantal/intäkter i scenarier är antaganden. Inga mejl, köp eller externa publiceringar utförs.

En riktig inloggad analys är nu verifierad genom användarens produktionskörning, sparade sju steg, 34 källor och slutrapport. Den automatiska testklienten har fortfarande ingen egen produktionssession. Lokala SDK-tester använder tydligt separata simulerade HTTP-svar och räknas inte som ett live-test.

## Lokal konfigurationskontroll

`npm run check:config` läser `.env.local` om den finns och rapporterar enbart variabelnamn/status, aldrig värden. För samma produktionsadress: `npm run check:config -- --production`. Kommandot gör inga nätverksanrop. Det avvisar privata Supabase-nycklar i klientvariabeln och hemligheter med publikt prefix. En godkänd formatkontroll bevisar inte tjänstebehörighet.

Det valfria betalda live-testet använder ett **befintligt separat testkonto**. `JARVIS_TEST_EMAIL` och `JARVIS_TEST_PASSWORD` behövs bara i den säkra lokala testmiljön, inte i Vercel. Det skapar inga konton och skickar inga mejl. Fristående Vitest läser inte `.env.local` automatiskt:

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.live.config.ts
```

## Granskning av säkerhetsråd

Supabase Security Advisor rapporterar varningar som behöver bedömas, inte döljas. För steg 3 tillkommer de två avsiktliga budget-RPC:erna `reserve_ai_cost` och `settle_ai_cost`; de kräver inloggning, kontrollerar ägare och beloppsgränser och ger ingen direkt skrivåtkomst till budgethistoriken. Anonyma saknar EXECUTE-rättighet. Se även den aktuella verifieringsrapporten.

Tidigare varningar för `SECURITY DEFINER`:

- `reserve_ai_request()` är avsiktligt tillgänglig för inloggade användare. Den kontrollerar `auth.uid()`, låser per konto och begränsar antalet anrop. Anonyma har ingen EXECUTE-rättighet.
- Supabases befintliga `rls_auto_enable()` har breda EXECUTE-grants och returnerar `event_trigger`. Definitionen aktiverar automatiskt RLS vid tabellskapande och använder `search_path=pg_catalog`. Den är inte en vanlig RPC-funktion som kan anropas som en normal SQL-funktion. Dess plattformsbehörigheter har inte ändrats.

Varningarna är dokumenterade, inte dolda eller rapporterade som en helt ren säkerhetskontroll. Se [anonyma SECURITY DEFINER-grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) och [inloggades SECURITY DEFINER-grants](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Ändra inte dessa projektbehörigheter utan att först granska konsekvenserna.

Steg 3-kontrollen rapporterar också [RLS utan policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) för `email_connections`. Detta är avsiktligt deny-by-default: alla klientgrants är återkallade, inga klientpolicies finns och endast serverrollen har åtkomst. En katalogkontroll bekräftar att både anon och authenticated saknar SELECT. Lägg inte till en ägarpolicy för att få bort informationsraden; det skulle exponera krypterade tokens i onödan.

[Skydd mot läckta lösenord](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) är avstängt i projektets befintliga Auth-konfiguration enligt Advisor. Det ändras inte automatiskt eftersom användaren uttryckligen kräver godkännande för säkerhetskritiska inställningar.
