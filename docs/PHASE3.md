# Steg 3: automatisering och försäljning

Befintlig kod, analyser och historik bevaras. Inga nya Supabase- eller Vercel-projekt behövs. Befintligt GitHub-repository är `Fante18/jarvis`, produktionsbranch `main` och Vercel-projekt `jarvis-ai-platform`.

## Vad som fungerar

- Dagliga eller veckovisa offentliga marknadsskanningar, central paus och högst fem scheman per arbetsyta. En daglig Vercel Cron-kontroll (`0 6 * * *`, UTC) köar högst tre uppdrag. En analys per användare samtidigt. Äldsta väntande schema prioriteras. Inga automatiska återförsök efter osäkra avbrott.
- Scout → Research → Validator → Strategist → Finance → Critic → Jarvis använder den befintliga analysmotorn. Schemalagda analyser skickar inga mejl och gör inga köp. Sales-förslag för en viss lead startas separat av användaren.
- Upprepade manuella uppdrag med samma offentliga ämne, privata bakgrund och Sales-val återanvänder en färdig analys från de senaste 20 timmarna. Tidigare källor för samma offentliga ämne återanvänds i högst sju dagar. Ursprungliga hämtningstider bevaras. En ny skanning söker också efter förändringar och motbevis.
- Nya analyser med samma normaliserade affärstitel eller stark ordöverlappning inom samma sökområde kopplas till befintlig möjlighet. Historiska analyser bevaras och senaste analysen uppdaterar möjlighetens AI-sammanfattning. Matchningen är deterministisk, inte en garanti för semantisk identitet. Mänsklig granskning behövs för närliggande affärsidéer.
- Källhänvisningar, hypoteser och kontrollerade ordagranna citat hålls isär. Källtext kan hämtas från en fast lista av offentliga myndighets-/statistikdomäner. Ingen godtycklig serverhämtning, inga interna adresser, begränsade omdirigeringar, sex sekunders timeout och 512 kB per sida. Ett källcitat är fortfarande inte oberoende faktakontroll.
- Kostnadsfria dagliga sammanfattningar byggs av sparade resultat: fynd, källor, poängförändringar, föreslaget nästa test, fel och förfallna CRM-uppföljningar. De sparas per UTC-dygn och uppdateras när arbetsytan öppnas, uppdateras manuellt eller vid den dagliga schemakontrollen (högst 20 aktiverade arbetsytor plus dagens körningar). Automatisk UI-pollning återanvänder sammanfattningar i högst 30 sekunder. Inga sammanfattningsmejl skickas.
- Befintlig CRM-pipeline kompletteras med möjlighet→research-lead, uppföljningsdatum, kontaktgrund, dokumenterat samtycke och kontaktsperr. En research-lead har uttryckligen okänd kund/kontakt och värde noll tills användaren anger verkliga uppgifter.
- Sales Agent kan förbereda ett personligt erbjudande utan webbsökning eller sändning. Mottagare och exakt text låses i ett säljutkast. Ändringar kräver ett nytt utkast och nytt godkännande. Godkänn på Approvals; skicka sedan genom ett separat manuellt klick på Sales.
- Faktiska inbetalningar, återbetalningar och betalda kostnader registreras separat i heltalsören. Unik referens och post-ID hindrar dubbelregistrering. Felaktiga poster makuleras och ersätts, historiken bevaras. Vunna CRM-affärer är affärsvärden, inte mottagna pengar. Ingen bank- eller bokföringssynk finns; utfallen är användarens registreringar, inte automatiskt verifierade transaktioner.
- Genomförda valideringstester sparar antagande, testreferens, stickprov, positiva utfall, resultat och koppling till ursprungsanalysen. Samma testreferens kan inte räknas två gånger för samma möjlighet. Efter minst fem avgörande testutfall för en möjlighet justeras dess prioritering med högst ±10. Osäkra tester påverkar inte justeringen. Modellens ursprungliga poäng och kod ändras inte. Återkoppling följer med som privat underlag till senare analyssteg, aldrig till webbsökningarna.
- Dashboard visar aktiva analyskörningar, dagliga fynd, öppna affärer, beslut, registrerat kassaflöde och API-budget. Nya audit-loggar är oföränderliga för användare och sparar bara identifierare, fältnamn och statusövergångar.

## Aktivera bakgrundskörningar

1. Använd befintligt Supabase-projekt **jarvis**, ref `yqzdkzwwqanwzeslmxtd`. Säkerställ att alla nya migrationer i `supabase/migrations/` är installerade. Kör aldrig de fyra ursprungliga migrationerna igen. Aktuell installationsstatus dokumenteras i `VERIFICATION.md`.
2. Öppna [Supabase API Keys](https://supabase.com/dashboard/project/yqzdkzwwqanwzeslmxtd/settings/api-keys). Under **Secret keys**: kopiera en befintlig servernyckel (`sb_secret_…`) eller skapa en separat nyckel för Jarvis-servern. Denna nyckel har höga databasrättigheter och får endast finnas på servern.
3. Öppna [Vercels projektvariabler](https://vercel.com/fante/jarvis-ai-platform/settings/environment-variables). Lägg nyckeln som **SUPABASE_SECRET_KEY**, endast **Production**, typ **Sensitive**. Behåll den befintliga publika Supabase-nyckeln för vanlig inloggning; ersätt den inte.
4. Generera privat en slumphemlighet på minst 32 tecken, exempelvis med `openssl rand -hex 32` på din egen dator. Lägg resultatet direkt i Vercel som **CRON_SECRET**, endast **Production**, **Sensitive**. Lägg aldrig värdet i chatten, koden eller GitHub.
5. Gör **Redeploy** i samma Vercel-projekt. Kontrollera att Cron Jobs visar `/api/cron/market-scan` dagligen cirka **06 UTC**. På Vercel Hobby kan tiden ligga inom den aktuella timmen; tätare scheman kräver annan plan och ändrad cron-frekvens. Appen utlovar inte timvisa skanningar.
6. Öppna Jarvis → **Settings → Marknadsskanningar & budget**. Ange dags-/månadsbudget, skapa ett offentligt sökområde och välj dagligen eller veckovis. Kryssa i schemats aktivering och aktivera central automatisering. Uppdrag kan köras vid nästa dagliga kontroll; ett förfallet schema kan även testas med Vercels **Run** för Cron Jobs efter att du valt och sparat budgeten.
7. Kontrollera körhistorik, källor och dagens sammanfattning. **Pausa all automatisering** stoppar nya automatiska uppdrag och begär stopp före nästa steg i pågående schemalagda analyser. Ett redan påbörjat API-anrop kan fortfarande kosta pengar.

Vanlig manuell analys, CRM och säljutkast använder fortsatt användarens Supabase-session och behöver inte servernyckeln. `SUPABASE_SECRET_KEY` används bara av autentiserad bakgrundsarbetare och serverns mejlintegration. RLS är kvar för vanliga användare; cron och mejlservern scope:ar varje begäran till rätt ägare. Servernyckeln är aldrig tillgänglig i klientkod eller API-svar.

## Budgetmodell

Standard är **$10/dag och $30/månad** med automatisering **avstängd**. Ändra detta i Settings. Dags- och månadsperioder följer UTC. Gränserna delas mellan kompletta analyser, chatt, egna agenter och Sales-förslag. Hela analysens maximala budget bokas före start; sedan reserveras fortfarande varje agentanrop separat. Äldre enstaka agenter reserverar konservativt $1.50 per körning, inklusive sin webbram. Sales-förslag och chatt bokar en konservativ tokenram före anropet.

Bokningar är atomiska under databaslås. Vid lyckat svar regleras de mot rapporterade tokens och dokumenterad verktygsram. Vid timeout, leverantörsfel eller avbruten körmiljö behålls reservationen. En gammal osäker reservation räknas även under nya perioder och släpps inte automatiskt. Återupptagning av en misslyckad analys kräver åter att hela körningens ram ryms; tidigare kostnad räknas konservativt igen om en ny period börjat. Detta kan stoppa en billig körning tidigare än förväntat och är avsiktligt.

Beräknade belopp är inte OpenAI-fakturor. Prisramen är låst till `gpt-4.1-mini`; ändra inte modell utan att uppdatera prispolicy och tester. Använd också OpenAI-projektets egna användningskontroller. Kostnader före denna version för chatt/egna agenter har inte rekonstruerats. Befintliga kompletta analysers sparade kostnad och reservationer importeras till budgethistoriken.

## Frivillig Gmail OAuth

Utkast och godkännanden fungerar utan detta. OAuth-anslutning och ett verkligt provutskick kan inte verifieras utan dina egna Google-inställningar och ditt uttryckliga godkännande för det konkreta meddelandet.

1. I ditt Google Cloud-projekt: aktivera **Gmail API** och konfigurera OAuth consent screen. Skapa en OAuth-klient av typen **Web application**. Använd inga lösenord eller app-lösenord för integrationen.
2. Authorized redirect URI ska vara exakt:
   `https://jarvis-ai-platform.vercel.app/api/integrations/gmail/callback`
   Detta är en annan callback än Supabase-inloggningens `/auth/callback`.
3. Tillåt scopes **openid**, **email** och **https://www.googleapis.com/auth/gmail.send**. Inga inkorgsläsningsbehörigheter behövs. Vid Testing: lägg till ditt Google-konto som testanvändare. Googles testläge kan ge tidsbegränsade refresh tokens; för bredare publik användning måste Googles publicerings- och verifieringskrav uppfyllas.
4. Lägg **GOOGLE_CLIENT_ID** och **GOOGLE_CLIENT_SECRET** i Vercel Production; client secret ska vara **Sensitive**. Lägg inte värdena i chatten.
5. Generera privat `openssl rand -base64 32`. Lägg resultatet som **EMAIL_ENCRYPTION_KEY**, Production, **Sensitive**. Värdet måste vara exakt 32 slumpbyte kodade i base64. Behåll det medan konton är anslutna; byte kräver att Gmail ansluts igen.
6. `SUPABASE_SECRET_KEY` från ovan behövs också. Gör **Redeploy**. Välj **Settings → Anslut Gmail** och godkänn i Google. Jarvis använder state bundet till din inloggade användare, PKCE, kortlivad HttpOnly-cookie, fasta Google-endpoints och AES-256-GCM för lagrade tokens.
7. På leaden: ange verklig e-postadress, dokumenterat samtycke med källa/datum och säkerställ att Kontakta inte är avmarkerat. Integrationens konservativa sändregel kräver uttryckligt samtycke även när annan rättslig grund kan vara tillämplig för lagring.
8. Skapa ett säljutkast, begär granskning, godkänn exakt innehåll på **Approvals** och välj därefter **Skicka godkänt mejl** på Sales. Inget skickas vid skapande, generering eller godkännande.
9. Vid timeout/osäker leverans: kontrollera **Skickat** i Gmail. Jarvis gör inga automatiska omförsök. Ett utskick kan ha lyckats trots förlorat svar. Skapa inte ett nytt förrän du granskat detta. Koppla från Gmail i Settings för att radera lagrade anslutningstokens och begära återkallning hos Google. Behörigheten kan också återkallas i ditt Google-konto.

## Integritet och begränsningar

- Lägg aldrig privata kontaktuppgifter i offentliga sökområden. Research använder tillåtna offentliga källor. Kontaktuppgifter kommer från användaren; inga kunder, mejladresser eller försäljningsresultat hittas på.
- Bedöm rättslig grund och tillämpliga marknadsföringsregler för varje kontakt. Jarvis gör ingen juridisk bedömning. Dokumentera samtycke, respektera invändningar och kontaktsperr. Invändningar/svar i Gmail synkas inte automatiskt; uppdatera CRM manuellt.
- Samla bara nödvändiga personuppgifter. CRM-leads kan raderas; finansiella registreringar kan behållas utan leadkoppling. Undvik personuppgifter i betalningsreferenser. Granska separat sparade analyser, chatt, filer och tidigare beslutsunderlag vid en raderingsbegäran. Det finns ingen automatisk fullständig GDPR-radering eller juridiskt verifierad lagringstid.
- OpenAI får det avgränsade underlaget som behövs. Tokens/nycklar skickas inte som promptinnehåll. Leverantörernas databehandlingsvillkor och rätt överföringsgrund behöver hanteras av verksamheten. Inga fakturor, ekonomiska transaktioner eller externa publiceringar utförs av agenterna.
- Schemaläggaren är en avgränsad daglig körning, inte en ständigt aktiv process. Vid serveravbrott markeras ett övergivet uppdrag som misslyckat vid nästa kontroll. Delresultat bevaras; återupptagning sker manuellt. Ingen obegränsad arbetskö, autonom kodändring eller automatisk mejluppföljning finns.

## Verifiering

`npm test` kör PostgreSQL/RLS-, budget-, integritets- och SDK-tester med simulerade leverantörssvar. `npm run test:e2e` kör UI-flöden mot produktionsbygget med avgränsade testdata. `npm run typecheck` och `npm run build` ska passera.

`npm run check:config -- --production --automation` kontrollerar format för schemaläggarens konfiguration utan att skriva ut värden. Lägg till `--email` för Gmail-gruppen. Dessa kontroller bevisar inte behörighet, modellåtkomst eller leverans. Aktuell riktig driftstatus och återstående manuella tester finns i `VERIFICATION.md`.
