# Jarvis analysmotor

Befintliga sidor, design, CRUD och anpassade enstaka agenter behålls. Den nya motorn ligger bredvid dem och kan startas från Ask Jarvis, AI Agents och Opportunities.

## Körningen

1. Användaren väljer ett **offentligt sökområde**, privat bakgrund, budget och eventuell Sales-analys.
2. Ett autentiserat, Origin-kontrollerat POST-anrop skapar `analysis_jobs` och returnerar 202.
3. Next.js `after()` håller arbetet igång efter svaret inom Vercels funktionsgräns. Webbläsaren följer sparad status; den driver inte agenternas steg.
4. Jarvis orkestreringspolicy kör Scout → Research → Validator → Strategist → Finance → Critic → Jarvis. Sales kan läggas in före Critic. En körning fokuserar på en kandidat.
5. Alla steg använder riktiga OpenAI Agents SDK/Responses-anrop. Varje steg har strikt Zod-format. Finance lämnar **hypotetiska ingångsantaganden**; servern räknar scenarier, marginal, resultat och break-even.
6. PostgreSQL-funktioner sparar varje delresultat, källa och klassificerat påstående atomiskt. Först efter samtliga steg skapas en affärsmöjlighet och en färdig rapport i samma transaktion. Uppskattade scenariointäkter förs inte över till faktiska försäljningsresultat.

`analysis_jobs` innehåller körstatus, kostnadsreservation, rapport och återupptagningsläge. `analysis_steps`, `analysis_sources` och `analysis_claims` lagrar spårbart underlag. RLS och ägarskapskontroller isolerar användarna.

## Informationskvalitet

Scout och Research har endast OpenAI:s inbyggda **läsande webbsökning**. Högst ett sökanrop tillåts per steg. En dokumenterad, läsande Hacker News/Algolia-API ger kompletterande offentliga diskussionssignaler. Hacker News är teknikorienterat, inte en representativ marknadsundersökning. Källornas URL, titel, hämtningstid, leverantör och tillgängliga utdrag sparas.

Modelltext får inte skapa egna källposter. Webbkällor tas ur leverantörens sök-/citeringsmetadata. En länk i modellens JSON-text räknas inte som källa. Ett påstående får klassificeringen verifierat källcitat endast om **hela påståendet är samma ordagranna citat** som ett faktiskt hämtat utdrag från en känd källa. Annars nedgraderas det till hypotes. Ett verifierat citat bevisar inte att källans sakpåstående är sant eller att någon vill betala för vår idé. Webbsökningskällor utan kontrollerbart utdrag ger därför inte automatiskt verifierade fakta.

Övriga påståenden markeras som uppskattningar eller hypoteser. Rapporternas sammanfattningar och poängmotiveringar är AI-bedömningar. Betalningsvalidering är alltid `untested` i detta första flöde: inga intervjuer, förbeställningar eller betalningar utförs. Critic granskar antagandena innan slutrekommendationen.

Den privata bakgrunden hålls helt utanför Scout och Research. Sales får vid behov avgränsad befintlig arbetsytekontext, inklusive användarregistrerade leads, utan möjlighet att webbsöka eller kontakta dem. Inga mejl-, köp-, publicerings- eller godkännandeverktyg exponeras för någon agent. Kontaktutkast kräver senare mänsklig hantering.

## Poängmodellen

Efterfrågan 30 %, genomförbarhet 20 %, kundåtkomst 15 %, ekonomi 20 % och riskhantering 15 %. Hög riskhanteringspoäng betyder lägre bedömd risk. Vikterna och slutpoängen räknas i kod.

- Betalningsvilja har inte testats: efterfrågan begränsas till 60.
- Färre än två dokumenterade källor: alla dimensioner begränsas till 40 och rekommendationen blir otillräckligt underlag (eller avstå).
- Negativt eller noll månadsresultat i basscenariot: ekonomidimensionen begränsas till 35.

Poängen är en prioriteringsmodell för vad som bör undersökas härnäst, **ingen framgångssannolikhet**.

## Kostnad och körgränser

Det nya flödet låser modellen till `gpt-4.1-mini` och en versionsstyrd prisram: $0.40/M indatatokens och $1.60/M utdatatokens. OpenAI:s dokumenterade fasta 8 000 sök-indatatokens plus sökavgift räknas konservativt in. Prisreferens: https://developers.openai.com/api/docs/pricing. Priser är exklusive skatt/valutaväxling; uppdatera tabellen före användning om leverantörens priser ändras.

- Användaren godkänner $1.20–$2.00 per analys; standard $1.50.
- Varje webbsteg reserverar $0.50 **före** anropet: det täcker konservativt hela modellens maximala kontext, begränsat svar och ett sökanrop enligt prisramen. Övriga steg reserverar en övre tokenkostnad från UTF-8-underlag, schemas storlek och SDK-marginal.
- SDK gör inga automatiska HTTP-omförsök. Högst ett modellsvar per specialist, 2 extra manuella anropsförsök totalt, max 2 200 utdatatokens/steg, 45 sekunder/steg och 240 sekunder/körning.
- Bara en komplett analys per konto får vara aktiv. Den befintliga atomiska PostgreSQL-gränsen tillåter högst 10 starter, chattfrågor och återupptagningsförsök per timme tillsammans.
- Vid oklart nät-/providerfel behålls hela reservationen: leverantören kan redan ha debiterat. Återupptagning använder återstående budget och kör inte färdiga steg igen.
- Prisramen avser applikationens API-användning. Den är inte en ändring av OpenAI-organisationens faktureringsinställningar. Inga säkerhets- eller faktureringsinställningar ändras automatiskt.

Budgetkontroller sker före anrop, inte bara genom att läsa kostnaden efteråt. Befintliga anpassade enstaka agenters äldre riktbudget beskrivs separat i UI; de har inte migrerats till den nya analysmotorn.

## Fel, stopp och drift

Stoppa begär avbrott före nästa modellanrop. Ett redan skickat anrop kan behöva avslutas och debiteras. Plattformskrascher lämnar delresultaten kvar. Efter den fem minuter långa låsperioden kan körningen återupptas manuellt; inga dolda scheman eller obegränsade omförsök körs. API:t använder Vercel `maxDuration=300`; kontrollera att den valda hostingplanen stöder det. Denna första version har inte en separat kö/worker för körningar längre än fyra minuter.

Kör samtliga migrationer, inklusive `20261017230742_analysis_pipeline.sql`, och konfigurera Supabase samt `OPENAI_API_KEY` enligt README. `OPENAI_MODEL` måste vara `gpt-4.1-mini` för den nya prisramen. Utan tjänsterna visas konfiguration; inga live-analyser simuleras.

## Verifiering

`npm test` innehåller ett komplett Scout-till-Jarvis-test med **riktiga SDK-koden och simulerade provider-HTTP-svar**, och ett separat test som kör samma flöde genom verkliga PostgreSQL-transaktioner i PGlite. Det testar ordning, budgetstopp, osäkra debiteringsreservationer, återupptagning, stopp, falska faktapåståenden, poäng, ekonomi och användarisolering. `npm run test:e2e` testar gränssnitt och API-gränser mot produktionsbygget. Testdata importeras aldrig av appen.

För ett riktigt tjänstetest: konfigurera servernycklar och ett separat befintligt testkonto via `JARVIS_TEST_EMAIL` och `JARVIS_TEST_PASSWORD`. Kör `npm run test:live`. Det gör riktiga modellanrop, kostar pengar inom analysens budget och sparar en riktig analys i testkontots Supabase-arbetsyta. Det skapar inga användare, skickar inga mejl och skriver aldrig ut nycklar. Utan konfiguration avslutas kommandot med ett tydligt fel, inte ett påhittat godkänt resultat.
