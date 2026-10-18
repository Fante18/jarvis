"use client";
import { entitySchemas, type Entity } from "@/lib/domain";
import type { WorkspaceState } from "@/lib/use-workspace";
import { Check, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal, statusLabels } from "./ui";
type Field = {
  key: string;
  label: string;
  type?:
    | "textarea"
    | "number"
    | "email"
    | "url"
    | "select"
    | "datetime-local"
    | "checkbox";
  options?: string[];
  default?: string | number;
};
const fields: Record<Entity, Field[]> = {
  agents: [
    { key: "name", label: "Namn" },
    { key: "description", label: "Uppdrag", type: "textarea" },
    {
      key: "kind",
      label: "Agenttyp",
      type: "select",
      options: ["research", "opportunity", "sales"],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["paused", "active"],
    },
    {
      key: "budget_cents",
      label: "Tokenbudget per körning (USD-cent, exkl. webbsökning)",
      type: "number",
      default: 50,
    },
  ],
  opportunities: [
    { key: "title", label: "Titel" },
    { key: "description", label: "Analys och nästa steg", type: "textarea" },
    { key: "sector", label: "Bransch" },
    {
      key: "score",
      label: "Bedömd potential (0–100)",
      type: "number",
      default: 50,
    },
    {
      key: "value",
      label: "Uppskattat affärsvärde (SEK)",
      type: "number",
      default: 0,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["new", "analyzing", "qualified", "archived"],
    },
    { key: "source_url", label: "Källa (https, valfri)", type: "url" },
  ],
  signals: [
    { key: "title", label: "Signal" },
    { key: "description", label: "Observation och belägg", type: "textarea" },
    { key: "sector", label: "Bransch" },
    {
      key: "strength",
      label: "Signalstyrka",
      type: "select",
      options: ["high", "medium", "low"],
    },
    { key: "source_url", label: "Källa (https)", type: "url" },
  ],
  leads: [
    { key: "name", label: "Kontaktperson" },
    { key: "company", label: "Företag" },
    { key: "email", label: "E-post (valfri)", type: "email" },
    { key: "value", label: "Affärsvärde (SEK)", type: "number", default: 0 },
    {
      key: "stage",
      label: "Steg",
      type: "select",
      options: ["new", "contacted", "proposal", "won", "lost"],
    },
    { key: "notes", label: "Anteckningar", type: "textarea" },
    {
      key: "next_action_at",
      label: "Nästa uppföljning (valfri)",
      type: "datetime-local",
    },
    {
      key: "lawful_basis",
      label: "Rättslig grund för kontaktuppgifter",
      type: "select",
      options: ["unknown", "consent", "legitimate_interest"],
    },
    {
      key: "consent_record",
      label: "Dokumenterat samtycke till mejl (källa och datum)",
      type: "textarea",
    },
    {
      key: "do_not_contact",
      label: "Kontakta inte / invändning registrerad",
      type: "checkbox",
    },
  ],
  approvals: [
    { key: "title", label: "Föreslagen åtgärd" },
    { key: "description", label: "Beslutsunderlag", type: "textarea" },
    {
      key: "risk",
      label: "Risk",
      type: "select",
      options: ["low", "medium", "high"],
    },
    {
      key: "action_type",
      label: "Typ",
      type: "select",
      options: ["research", "outreach", "investment"],
    },
    {
      key: "amount",
      label: "Uppskattad kostnad (SEK)",
      type: "number",
      default: 0,
    },
  ],
};
export default function Editor({
  entity,
  record,
  state,
  onClose,
}: {
  entity: Entity;
  record?: Record<string, unknown>;
  state: WorkspaceState;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const f of fields[entity])
      payload[f.key] =
        f.type === "checkbox"
          ? fd.get(f.key) === "on"
          : f.type === "datetime-local"
            ? fd.get(f.key)
              ? new Date(String(fd.get(f.key))).toISOString()
              : null
            : f.type === "number"
              ? Number(fd.get(f.key))
              : String(fd.get(f.key) || "");
    if (entity === "leads")
      payload.opportunity_id = record?.opportunity_id || null;
    if (entity === "signals")
      payload.published_at = record?.published_at || new Date().toISOString();
    if (entity === "approvals") payload.status = "pending";
    const parsed = entitySchemas[entity].safeParse(payload);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map(
            (i) =>
              `${fields[entity].find((f) => f.key === i.path[0])?.label || String(i.path[0])}: ${i.message}`,
          )
          .join(" · "),
      );
      return;
    }
    try {
      await state.mutate(entity, parsed.data, record?.id as string);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal title={record ? "Redigera" : "Skapa ny post"} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        {fields[entity].map((f) => (
          <label key={f.key}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                name={f.key}
                rows={4}
                maxLength={12000}
                defaultValue={String(record?.[f.key] || "")}
              />
            ) : f.type === "select" ? (
              <select
                name={f.key}
                defaultValue={String(record?.[f.key] || f.options![0])}
              >
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {statusLabels[o] || o}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <input
                type="checkbox"
                name={f.key}
                defaultChecked={Boolean(record?.[f.key])}
              />
            ) : (
              <input
                name={f.key}
                type={f.type || "text"}
                min={f.type === "number" ? 0 : undefined}
                maxLength={f.type !== "number" ? 300 : undefined}
                required={
                  !["email", "source_url", "next_action_at"].includes(f.key) ||
                  entity === "signals"
                }
                defaultValue={
                  f.type === "datetime-local" && record?.[f.key]
                    ? new Date(
                        new Date(String(record[f.key])).getTime() -
                          new Date(String(record[f.key])).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : String(record?.[f.key] ?? f.default ?? "")
                }
              />
            )}
          </label>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Avbryt
          </button>
          <button className="button primary" disabled={state.busy}>
            {state.busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Spara{state.mode === "demo" ? " i demo" : ""}
          </button>
        </div>
      </form>
    </Modal>
  );
}
