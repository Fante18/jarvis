"use client";
import type { Agent } from "@/lib/domain";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import { ArrowRight, Loader2, Play, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Modal } from "./ui";
export default function RunDialog({
  agent,
  state,
  onClose,
  initialPrompt = "",
}: {
  agent: Agent;
  state: WorkspaceState;
  onClose: () => void;
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const enabled =
    state.mode === "live" && state.config.openai && agent.status === "active";
  async function run(e: FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError("");
    try {
      const result = await api("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({ agent_id: agent.id, prompt }),
      });
      setOutput(result.output);
      await state.reload();
    } catch (e) {
      setError((e as Error).message);
      await state.reload().catch(() => {});
    } finally {
      setRunning(false);
    }
  }
  return (
    <Modal title={agent.name} onClose={onClose} closeDisabled={running} wide>
      <form className="form-stack" onSubmit={run}>
        <p className="modal-description">{agent.description}</p>
        {!enabled && (
          <div className="config-callout">
            <Settings2 size={18} />
            <p>
              {state.mode !== "live"
                ? "Anslut Supabase och logga in för att köra riktiga agenter."
                : !state.config.openai
                  ? "Lägg till OPENAI_API_KEY på servern."
                  : "Aktivera agenten innan du kör den."}
              <Link href="/settings">
                Visa konfiguration
                <ArrowRight size={13} />
              </Link>
            </p>
          </div>
        )}
        <label>
          Uppdrag
          <textarea
            rows={4}
            placeholder="Exempel: Utforska AI-automation för svenska redovisningsbyråer. Granska källor och föreslå tre validerbara affärsidéer."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            minLength={10}
            maxLength={3000}
            disabled={!enabled || running}
          />
        </label>
        <p className="help-note">
          Tokenbudget: ${(agent.budget_cents / 100).toFixed(2)}. Ett agentsvar,
          högst 3 webbsökningar och 10 AI-anrop/timme. Sökkostnader tillkommer.
          Riktbudgeten är inte ett hårt kostnadstak. Agenten sparar förslag, men
          skickar inga meddelanden.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {output && (
          <div className="ai-output">
            <strong>Analys klar</strong>
            <p>{output}</p>
            <Link href="/opportunities" className="text-link">
              Granska möjligheter
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={running}
            onClick={onClose}
          >
            Stäng
          </button>
          <button className="button primary" disabled={!enabled || running}>
            {running ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Play size={15} />
            )}{" "}
            {running ? "Analyserar…" : "Starta körning"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
