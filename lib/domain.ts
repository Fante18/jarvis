import { z } from "zod";
export const sections = [
  "dashboard",
  "agents",
  "opportunities",
  "intelligence",
  "sales",
  "approvals",
  "chat",
  "settings",
] as const;
export type Section = (typeof sections)[number];
const text = z.string().trim().min(1).max(300);
const long = z.string().trim().max(12000);
export const entitySchemas = {
  agents: z
    .object({
      name: text,
      description: long,
      kind: z.enum(["research", "opportunity", "sales"]),
      status: z.enum(["active", "paused"]),
      budget_cents: z.number().int().min(1).max(100000),
    })
    .strict(),
  opportunities: z
    .object({
      title: text,
      description: long,
      sector: text,
      score: z.number().int().min(0).max(100),
      value: z.number().min(0).max(1e12),
      status: z.enum(["new", "analyzing", "qualified", "archived"]),
      source_url: z.string().url().startsWith("https://").or(z.literal("")),
    })
    .strict(),
  signals: z
    .object({
      title: text,
      description: long,
      sector: text,
      strength: z.enum(["high", "medium", "low"]),
      source_url: z.string().url().startsWith("https://"),
      published_at: z.string().datetime(),
    })
    .strict(),
  leads: z
    .object({
      name: text,
      company: text,
      email: z.string().email().or(z.literal("")),
      value: z.number().min(0).max(1e12),
      stage: z.enum(["new", "contacted", "proposal", "won", "lost"]),
      notes: long,
      opportunity_id: z.string().uuid().nullable().default(null),
      next_action_at: z.string().datetime().nullable().default(null),
      lawful_basis: z
        .enum(["unknown", "consent", "legitimate_interest"])
        .default("unknown"),
      consent_record: z.string().trim().max(1500).default(""),
      do_not_contact: z.boolean().default(false),
    })
    .strict(),
  approvals: z
    .object({
      title: text,
      description: long,
      risk: z.enum(["low", "medium", "high"]),
      status: z.literal("pending"),
      action_type: z.enum(["research", "outreach", "investment"]),
      amount: z.number().min(0).max(1e12),
    })
    .strict(),
};
export type Entity = keyof typeof entitySchemas;
export type BaseRow = { id: string; created_at: string; updated_at?: string };
export type Agent = z.infer<typeof entitySchemas.agents> & BaseRow;
export type Opportunity = z.infer<typeof entitySchemas.opportunities> &
  BaseRow & {
    origin_analysis_id?: string | null;
    verified_evidence_count?: number;
  };
export type Signal = z.infer<typeof entitySchemas.signals> & BaseRow;
export type Lead = z.input<typeof entitySchemas.leads> & BaseRow;
export type Approval = Omit<z.infer<typeof entitySchemas.approvals>, "status"> &
  BaseRow & {
    status: "pending" | "approved" | "rejected";
    decided_at?: string;
  };
export type Activity = BaseRow & {
  title: string;
  description: string;
  kind: string;
};
export type AgentRun = BaseRow & {
  agent_id: string;
  input?: string;
  model?: string;
  status: "running" | "completed" | "failed";
  output: string;
  error: string | null;
  completed_at?: string;
  tokens?: number;
};
export type Message = BaseRow & { role: "user" | "assistant"; content: string };
export type Workspace = {
  agents: Agent[];
  opportunities: Opportunity[];
  signals: Signal[];
  leads: Lead[];
  approvals: Approval[];
  activities: Activity[];
  agent_runs: AgentRun[];
  messages: Message[];
};
export const emptyWorkspace = (): Workspace => ({
  agents: [],
  opportunities: [],
  signals: [],
  leads: [],
  approvals: [],
  activities: [],
  agent_runs: [],
  messages: [],
});
export const settingsSchema = z
  .object({
    workspace_name: text,
    focus_sectors: z.string().max(300),
    currency: z.literal("SEK"),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  workspace_name: "Min arbetsyta",
  focus_sectors: "AI, SaaS, hållbarhet",
  currency: "SEK",
};
export const money = (n: number, compact = false) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(n);
export function metrics(data: Workspace) {
  const won = data.leads.filter((l) => l.stage === "won");
  return {
    revenue: won.reduce((s, l) => s + l.value, 0),
    pipeline: data.leads
      .filter((l) => !["won", "lost"].includes(l.stage))
      .reduce((s, l) => s + l.value, 0),
    opportunities: data.opportunities.filter((o) => o.status !== "archived")
      .length,
    activeAgents: data.agents.filter((a) => a.status === "active").length,
    conversion: data.leads.length
      ? Math.round((won.length / data.leads.length) * 100)
      : 0,
  };
}
export function assertEntity(s: string): s is Entity {
  return s in entitySchemas && Object.hasOwn(entitySchemas, s);
}
export const idSchema = z.string().uuid();
export function mutationOriginAllowed(
  origin: string | null,
  requestUrl: string,
  configuredOrigin?: string,
) {
  if (!origin) return false;
  try {
    return origin === new URL(configuredOrigin || requestUrl).origin;
  } catch {
    return false;
  }
}
export const safeSourceUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};
