import type { FinalAnalysis, StageResult } from "./contracts";

export type CommercialBrief = {
  version: 1;
  status: "review" | "research" | "stop";
  offer: { audience: string; problem: string; deliverable: string };
  monthly_price_hypothesis_sek: number | null;
  validation_test: FinalAnalysis["validation_tests"][number] | null;
  delivery_steps: string[];
  contact_draft: string;
  contact_draft_origin: "sales_agent" | "template";
  verified_quotes: number;
  source_urls: string[];
  blockers: string[];
};

// Commercial preparation reuses saved specialists. No extra model call, prospect
// invention, financial transaction, or publication is performed here.
export function commercialBrief(
  report: FinalAnalysis,
  results: StageResult[],
): CommercialBrief {
  const strategy = results.find((r) => r.role === "strategist")?.output;
  const finance = results.find((r) => r.role === "finance");
  const critic = results.find((r) => r.role === "critic")?.output;
  const sales = results.find((r) => r.role === "sales")?.output.contact_draft;
  const offer = strategy?.opportunity || report.opportunity;
  const test = report.validation_tests[0] || null;
  const sourceUrls = [
    ...new Set(results.flatMap((r) => r.sources.map((s) => s.url))),
  ];
  const verified = new Set(
    results.flatMap((r) =>
      r.claims
        .filter((c) => c.verification === "source_quote")
        .map((c) => c.statement),
    ),
  ).size;
  const base = report.scenarios.find((s) => s.name === "Basantagande");
  const price = finance?.output.financial_assumptions?.price_sek;
  const blockers: string[] = [];
  if (sourceUrls.length < 2)
    blockers.push("Färre än två dokumenterade källor.");
  if (verified === 0)
    blockers.push(
      "Inga källcitat är automatiskt verifierade. Kontrollera beläggen manuellt.",
    );
  if (report.scorecard.total < 50)
    blockers.push(
      "Prioriteringspoängen är under 50; mer underlag behövs innan ett affärstest föreslås.",
    );
  if (!test)
    blockers.push("Ett mätbart valideringstest med stoppkriterium saknas.");
  if (!base || base.monthly_profit_sek <= 0)
    blockers.push("Ett lönsamt basscenario saknas. Ekonomin behöver omprövas.");
  if (price === undefined || price <= 0)
    blockers.push("Ett positivt prisantagande saknas.");
  if (report.recommendation === "insufficient_evidence")
    blockers.push("Jarvis bedömer underlaget som otillräckligt.");
  const rejected =
    report.recommendation === "reject" || critic?.recommendation === "reject";
  if (rejected) blockers.push("Jarvis eller Critic rekommenderar att avstå.");
  // Sources and model scores justify reviewing a test, never assuming demand or
  // treating a generated target segment as a real customer.
  const ready =
    !rejected &&
    sourceUrls.length >= 2 &&
    report.scorecard.total >= 50 &&
    Boolean(
      test && base && base.monthly_profit_sek > 0 && price && price > 0,
    ) &&
    report.recommendation !== "insufficient_evidence";
  blockers.push(
    "Betalningsvilja, verklig köpare och leveransförmåga måste bekräftas. Ingen kundlösning har byggts av detta flöde.",
  );
  return {
    version: 1,
    status: rejected ? "stop" : ready ? "review" : "research",
    offer: {
      audience: offer.audience,
      problem: offer.problem,
      deliverable: offer.offer,
    },
    monthly_price_hypothesis_sek:
      price !== undefined && price > 0 ? price : null,
    validation_test: test,
    delivery_steps: strategy?.plan || report.next_steps,
    contact_draft:
      sales ||
      `Hej! Vi undersöker följande problem: ${offer.problem}\n\nEn möjlig lösning är: ${offer.offer}\n\nÄr detta relevant för er verksamhet? Hur hanterar ni det idag, och skulle ni överväga ett avgränsat betalt test om nyttan kan visas?\n\nDetta är ett generiskt, osänt utkast. Anpassa det till en verklig mottagare och granska kontaktgrunden före användning.`,
    contact_draft_origin: sales ? "sales_agent" : "template",
    verified_quotes: verified,
    source_urls: sourceUrls.slice(0, 10),
    blockers,
  };
}
