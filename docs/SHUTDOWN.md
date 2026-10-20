# Avstängning 2026-10-20

Ägaren har avslutat projektet. Källkod, Git-historik, produktutkast, ursprunglig ZIP-backup och sparade molndata bevaras.

## Avstängning via koden

- `lib/project-state.ts` låser projektet som nedstängt.
- `proxy.ts` avvisar alla app-/API-anrop med HTTP 410 innan Supabase, OpenAI eller andra integrationer kontaktas.
- `requireAI()` och `aiClient()` spärrar AI-användning även om en nyckel finns kvar i servermiljön.
- `vercel.json` har inga cronjobb. Efter avstängningspubliceringen stängs även automatiska Git-publiceringar av i samma fil.
- Lokala byggfiler, installerade projektberoenden och genererade testresultat kan tas bort och återskapas från källan om ägaren senare uttryckligen vill återstarta.

Två riktade avstängningstester och produktionsbygget inklusive TypeScript passerar. Riktiga lokala HTTP-anrop mot startsidan, workspace-API, cron-API och chatt-POST returnerar samtliga 410. Ingen lokal verifieringsserver lämnas igång. Historiska tester av aktiv AI-drift gäller versionen före avstängning.

## Molnkonton: manuella steg som fortfarande behövs

Anslutningarna nekade administrativ avstängning: Supabase SQL och project pause saknar behörighet, Vercel project pause ger 403 för team `fante`. CLI saknar egna Vercel-inloggningsuppgifter. Inga nya inloggningsflöden eller ändringar av säkerhetsinställningar startas.

För fullständig avstängning inklusive tidigare deployment-URL:er och molnresurser:

1. Öppna [befintliga Vercel-projektets inställningar](https://vercel.com/fante/jarvis-ai-platform/settings) och pausa `jarvis-ai-platform` med **Pause Project**.
2. Öppna [befintliga Supabase-projektets inställningar](https://supabase.com/dashboard/project/yqzdkzwwqanwzeslmxtd/settings/general) och pausa `jarvis` med **Pause project**.
3. Återkalla OpenAI-nyckeln som användes för Jarvis under [API Keys](https://platform.openai.com/api-keys). Nyckelvärdet behöver inte visas, kopieras eller skickas i chatten.

Inga molnprojekt, data eller API-nycklar har raderats av denna åtgärd. Kodens stopp är inte samma sak som administrativ paus av hela kontot eller uppsägning av eventuella abonnemang.
