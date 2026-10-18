import { z } from "zod";
export const controlsSchema = z
  .object({
    enabled: z.boolean(),
    daily_limit_cents: z.number().int().min(120).max(10000),
    monthly_limit_cents: z.number().int().min(120).max(100000),
  })
  .strict()
  .refine(
    (v) => v.monthly_limit_cents >= v.daily_limit_cents,
    "Månadsbudgeten måste vara minst dagsbudgeten.",
  );
export const scheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    topic: z.string().trim().min(10).max(500),
    interval_days: z.union([z.literal(1), z.literal(7)]),
    budget_cents: z.number().int().min(120).max(200),
    enabled: z.boolean(),
  })
  .strict();
export type Controls = z.infer<typeof controlsSchema>;
export type Schedule = z.infer<typeof scheduleSchema> & {
  id: string;
  next_run_at: string;
  last_run_at: string | null;
  last_error: string | null;
};
export const defaultControls: Controls = {
  enabled: false,
  daily_limit_cents: 1000,
  monthly_limit_cents: 3000,
};
export type Calibration = {
  samples: number;
  supported: number;
  refuted: number;
  adjustment: number;
};
export function calibration(outcomes: { verdict: string }[]): Calibration {
  const measured = outcomes.filter((o) => o.verdict !== "inconclusive");
  const supported = measured.filter((o) => o.verdict === "supported").length;
  const refuted = measured.filter((o) => o.verdict === "refuted").length;
  // Small samples do not change priorities. Bounded, deterministic feedback; no self-modifying code.
  return {
    samples: measured.length,
    supported,
    refuted,
    adjustment:
      measured.length < 5
        ? 0
        : Math.round((10 * (supported - refuted)) / measured.length),
  };
}
export function priority(
  score: number,
  verified: number,
  feedback: Calibration,
) {
  return {
    verified,
    adjusted_score: Math.max(0, Math.min(100, score + feedback.adjustment)),
  };
}
export type Digest = {
  day: string;
  generated_at: string;
  findings: {
    id: string;
    analysis_id: string;
    title: string;
    score: number;
    verified: number;
    sources: string[];
    next_step: string;
    change: number | null;
  }[];
  completed: number;
  failed: number;
  pending_approvals: number;
  followups: number;
  note: string;
};
export const feedbackSchema = z
  .object({
    opportunity_id: z.string().uuid(),
    analysis_id: z.string().uuid().nullable(),
    test_reference: z.string().trim().min(1).max(120),
    sample_size: z.number().int().min(1).max(1000000),
    positive_results: z.number().int().min(0).max(1000000),
    assumption: z.string().trim().min(5).max(1500),
    result: z.string().trim().min(5).max(2000),
    verdict: z.enum(["supported", "refuted", "inconclusive"]),
    evidence_url: z.string().url().startsWith("https://").or(z.literal("")),
    observed_at: z.string().datetime(),
  })
  .strict()
  .refine(
    (v) => v.positive_results <= v.sample_size,
    "Positiva utfall kan inte överstiga stickprovet.",
  );
export const cashSchema = z
  .object({
    id: z.string().uuid(),
    lead_id: z.string().uuid().nullable(),
    opportunity_id: z.string().uuid().nullable(),
    kind: z.enum(["receipt", "refund", "cost"]),
    amount_cents: z.number().int().min(1).max(100000000000),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: z.string().trim().min(1).max(200),
    evidence_url: z.string().url().startsWith("https://").or(z.literal("")),
  })
  .strict();
export type CashEntry = z.infer<typeof cashSchema> & {
  created_at: string;
  voided_at: string | null;
};
export const draftSchema = z
  .object({
    lead_id: z.string().uuid(),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((v) => !/[\r\n]/.test(v)),
    body: z.string().trim().min(10).max(8000),
  })
  .strict();
export type SalesDraft = {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  recipient: string;
  status:
    | "draft"
    | "pending"
    | "approved"
    | "rejected"
    | "sending"
    | "sent"
    | "unknown"
    | "failed";
  approval_id: string | null;
  created_at: string;
  error: string | null;
  provider_message_id: string | null;
};
