import { z } from "zod";
import type { CommercialBrief } from "./commercial";
export const agentRoles = [
  "scout",
  "research",
  "validator",
  "strategist",
  "finance",
  "sales",
  "critic",
  "jarvis",
] as const;
export type AgentRole = (typeof agentRoles)[number];
export const specialists: Record<
  AgentRole,
  { name: string; task: string; web: boolean }
> = {
  scout: {
    name: "Scout Agent",
    task: "Upptäck en avgränsad affärsmöjlighet ur trender, dokumenterade problem och offentlig information. Beskriv konkret problem, målgrupp och vad som behöver undersökas. Sök på webben.",
    web: true,
  },
  research: {
    name: "Research Agent",
    task: "Fyll market_research med konkurrenter, segment, marknadsstorlek och belägg; okända storlekar ska anges som okända. Sök efter motbevis. Undersök verkliga konkurrenter, målgrupp, marknadsstorlek och efterfrågan med offentlig webbresearch. Skilj mellan observerade källor och oberoende verifierade sakförhållanden. Ange när marknadsstorlek saknar tillförlitligt underlag.",
    web: true,
  },
  validator: {
    name: "Validator Agent",
    task: "Pröva betalningsviljan. Intresse eller diskussioner bevisar inte köpvilja. Börja med ett litet intervjuprov, ett prisförslag eller en genomgång av ett befintligt arbetsflöde. Första testet ska kunna föreslås inom 14 dagar med högst 500 SEK i uppskattad extern kostnad; tid och arbetsinsats ska framgå. Kräv inte att en hel kundprodukt byggs före validering. Ange mätetal, fortsätt- och stoppkriterier samt realistisk kostnad, och lämna validation_tests tom om inget sådant test kan motiveras. Inga tester har utförts och ingen testkostnad är godkänd.",
    web: false,
  },
  strategist: {
    name: "Strategist Agent",
    task: "Utveckla ett konkret erbjudande i opportunity.offer: avgränsad leverans, tydlig köpare, vilket problem som löses och vilket mätbart resultat som ska testas. Föreslå den minsta leverans som kan valideras före större utveckling. Jarvis kan idag skapa källbelagda analyser och dokumentutkast; egen programvara, kundintegrationer, inkorgsläsning, betalningar och produktleverans är inte tillgängliga agentverktyg. Beskriv sådana beroenden som återstående arbete och föreslå inte att ett komplett affärssystem ska byggas som första pilot. Bedöm vilken mänsklig kompetens, kundåtkomst och granskning som behövs. Hitta inte på partnerskap, kunder, byggda produkter eller leveransförmåga.",
    web: false,
  },
  finance: {
    name: "Finance Agent",
    task: "Lämna försiktiga hypotetiska månadsantaganden i financial_assumptions, i SEK: pris per kund, rörlig kostnad per kund, fasta kostnader, kundanskaffningskostnad, antaget antal kunder och startkostnad. Dessa är scenarier, aldrig verkliga intäkter. Förklara antaganden och risker. Aritmetiken räknas av servern.",
    web: false,
  },
  sales: {
    name: "Sales Agent",
    task: "Skriv ett konkret contact_draft, utan mottagaradress eller påhittad kund, för mänsklig granskning. Skapa säljstrategi, ICP, analys av offentliga kundsegment och utkast till kundkontakt. Inga påhittade personer, mejladresser, kunder eller genomförda kontakter. Utkast lämnas för separat mänskligt godkännande.",
    web: false,
  },
  critic: {
    name: "Critic Agent",
    task: "Granska alla tidigare steg, ekonomiska scenarier, motbevis, bias och svaga antaganden. Leta efter obestyrkta siffror och sammanblandning av intresse och betalningsvilja. Föreslå vad som måste valideras eller förkastas.",
    web: false,
  },
  jarvis: {
    name: "Jarvis",
    task: "Sammanställ en beslutsbar rekommendation efter Critic. Ange prioritering, osäkerheter och nästa valideringstest. Fyll fem poängdimensioner med heltal på skalan 0–100, aldrig en 0–10-skala. Kalibrera varje motivering: 0 innebär mycket svagt stöd, 25 svagt, 50 blandat/osäkert, 75 starkt och 100 mycket starkt stöd. Låga poäng är tillåtna när beläggen motiverar dem. Hög riskpoäng betyder lägre bedömd risk. Poäng är en prioriteringsmodell, aldrig sannolikhet för framgång. Uppgifter om faktisk betalningsvilja saknas tills valideringstester faktiskt genomförts.",
    web: false,
  },
};
const short = z.string().min(1).max(1200);
export const analysisRequestSchema = z
  .object({
    topic: z.string().trim().min(10).max(500),
    notes: z.string().trim().max(1500).default(""),
    budget_cents: z.number().int().min(120).max(200).default(150),
    include_sales: z.boolean().default(false),
  })
  .strict();
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export const claimSchema = z
  .object({
    kind: z.enum(["fact", "estimate", "hypothesis"]),
    statement: short,
    source_urls: z.array(z.string().url().startsWith("https://")).max(5),
    quote: z.string().max(1200),
  })
  .strict();
export const dimensionKeys = [
  "demand",
  "feasibility",
  "customer_access",
  "economics",
  "risk",
] as const;
const dimension = z
  .object({
    score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        "Heltal på skalan 0–100: 0 mycket svagt, 25 svagt, 50 blandat, 75 starkt, 100 mycket starkt. Använd inte 0–10-skala. För risk betyder högre poäng lägre risk.",
      ),
    reason: short,
  })
  .strict();
export const dimensionsSchema = z
  .object({
    demand: dimension,
    feasibility: dimension,
    customer_access: dimension,
    economics: dimension,
    risk: dimension,
  })
  .strict();
export const financialSchema = z
  .object({
    price_sek: z.number().min(0).max(1e7),
    variable_cost_sek: z.number().min(0).max(1e7),
    fixed_cost_sek: z.number().min(0).max(1e9),
    acquisition_cost_sek: z.number().min(0).max(1e7),
    assumed_customers: z.number().int().min(0).max(1e6),
    startup_cost_sek: z.number().min(0).max(1e9),
    rationale: short,
  })
  .strict();
export const stageOutputSchema = z
  .object({
    summary: short,
    market_research: z
      .object({
        competitors: z
          .array(
            z
              .object({
                name: z.string().min(1).max(200),
                offer: short,
                source_urls: z
                  .array(z.string().url().startsWith("https://"))
                  .max(3),
              })
              .strict(),
          )
          .max(3),
        segments: z.array(short).max(3),
        market_size: z
          .object({
            kind: z.enum(["unknown", "estimate", "source_quote"]),
            text: short,
            source_urls: z
              .array(z.string().url().startsWith("https://"))
              .max(3),
            quote: z.string().max(1200),
          })
          .strict(),
        demand_evidence: short,
      })
      .strict()
      .nullable(),
    contact_draft: z.string().max(2500).nullable(),
    opportunity: z
      .object({
        title: z.string().min(1).max(200),
        problem: short,
        audience: short,
        offer: short,
      })
      .strict(),
    claims: z.array(claimSchema).max(8),
    validation_tests: z
      .array(
        z
          .object({
            test: short,
            metric: short,
            pass_criterion: short,
            stop_criterion: short,
            estimated_cost_sek: z.number().min(0).max(1e7),
            days: z.number().int().min(1).max(365),
          })
          .strict(),
      )
      .max(3),
    plan: z.array(short).max(6),
    risks: z.array(short).max(6),
    financial_assumptions: financialSchema.nullable(),
    dimensions: dimensionsSchema.nullable(),
    recommendation: z.enum([
      "test",
      "proceed_cautiously",
      "reject",
      "insufficient_evidence",
    ]),
  })
  .strict();
export type StageOutput = z.infer<typeof stageOutputSchema>;
export type Source = {
  url: string;
  title: string;
  excerpt: string;
  retrieved_at: string;
  provider: "hacker_news" | "openai_web_search";
};
export type CheckedClaim = z.infer<typeof claimSchema> & {
  verification: "source_quote" | "unverified";
  warning: string | null;
};
export type FinancialScenario = {
  name: string;
  customers: number;
  monthly_revenue_sek: number;
  monthly_variable_cost_sek: number;
  monthly_profit_sek: number;
  gross_margin_percent: number | null;
  breakeven_customers: number | null;
  acquisition_spend_sek: number;
  initial_cash_needed_sek: number;
};
export type StageResult = {
  role: AgentRole;
  output: StageOutput;
  claims: CheckedClaim[];
  sources: Source[];
  input_tokens: number;
  output_tokens: number;
  cost_microusd: number;
  reserved_microusd: number;
  scenarios: FinancialScenario[];
  completed_at: string;
};
export type Scorecard = {
  total: number;
  dimensions: z.infer<typeof dimensionsSchema>;
  weights: Record<(typeof dimensionKeys)[number], number>;
  limitations: string[];
};
export type FinalAnalysis = {
  commercial_brief?: CommercialBrief;
  recommendation: StageOutput["recommendation"];
  summary: string;
  opportunity: StageOutput["opportunity"];
  scorecard: Scorecard;
  scenarios: FinancialScenario[];
  validation_tests: StageOutput["validation_tests"];
  risks: string[];
  next_steps: string[];
  payment_validation: "untested";
  source_count: number;
  model: string;
  pricing_version: string;
};
export type AnalysisJob = {
  id: string;
  user_id?: string;
  topic: string;
  notes: string;
  private_context?: string;
  budget_cents: number;
  include_sales: boolean;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "budget_exceeded";
  active_role: AgentRole | null;
  results: StageResult[];
  report: FinalAnalysis | null;
  spent_microusd: number;
  reserved_microusd: number;
  attempted_calls: number;
  error: string | null;
  cancel_requested: boolean;
  created_at: string;
  updated_at: string;
  lease_until: string | null;
  opportunity_id: string | null;
};
export const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;

export type AnalysisSummary = Omit<
  AnalysisJob,
  "results" | "notes" | "user_id"
> & { step_count: number };
