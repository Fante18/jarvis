"use client";
import AnalysisWorkspace from "../analysis/workspace";
import type { Agent } from "@/lib/domain";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import { ArrowUpRight, Database, Loader2, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Orb } from "../ui";
export default function Chat({
  state,
  onRun,
}: {
  state: WorkspaceState;
  onRun: (agent: Agent, prompt: string) => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.data.messages.length, busy]);
  const enabled = state.mode === "live" && state.config.openai;
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: input }),
      });
      setInput("");
      await state.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-panel panel">
      <div className="chat-top">
        <div className="chat-avatar">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>JARVIS</strong>
          <span>Din strategiska AI-partner</span>
        </div>
        <span className="chat-model">{state.config.model}</span>
      </div>
      <AnalysisWorkspace state={state} initialTopic={input} compact />
      <div className="chat-messages">
        {!state.data.messages.length ? (
          <div className="chat-welcome">
            <Orb small />
            <span className="eyebrow">
              A LITTLE CLARITY. A LOT OF POSSIBILITY.
            </span>
            <h2>Vad vill du utforska?</h2>
            <p>
              Från en första idé till en genomtänkt affärsstrategi.
              <br />
              Jag hjälper dig att se nästa steg.
            </p>
            <div className="chat-suggestions">
              {[
                "Vilka möjligheter har högst potential?",
                "Analysera min försäljningspipeline",
                "Föreslå nästa steg för min arbetsyta",
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}>
                  <Sparkles size={14} />
                  {s}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {[...state.data.messages]
              .sort(
                (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
              )
              .map((m) => (
                <div className={`message message-${m.role}`} key={m.id}>
                  <span>{m.role === "user" ? "DU" : "JARVIS"}</span>
                  <p>{m.content}</p>
                </div>
              ))}
          </div>
        )}
        {busy && (
          <div className="chat-thinking">
            <Loader2 size={16} className="spin" />
            Jarvis tänker…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="chat-compose">
        {!enabled && (
          <p className="chat-config">
            <Database size={14} />
            AI-chatten kräver Supabase, inloggning och OPENAI_API_KEY.
            <Link href="/settings">
              Konfigurera
              <ArrowUpRight size={12} />
            </Link>
          </p>
        )}
        {state.data.agents.length > 0 && (
          <div className="chat-agent-control">
            <select
              aria-label="Välj agent för chattuppdrag"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="">Välj en agent…</option>
              {state.data.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button secondary small"
              disabled={!selectedAgent || !input.trim()}
              onClick={() => {
                const agent = state.data.agents.find(
                  (a) => a.id === selectedAgent,
                );
                if (agent) onRun(agent, input);
              }}
            >
              <Play size={12} />
              Granska & kör uppdrag
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={send}>
          <textarea
            aria-label="Meddelande till Jarvis"
            placeholder={
              enabled
                ? "Fråga Jarvis om din nästa möjlighet…"
                : "Förbered din fråga. Anslut AI för att skicka."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={4000}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (enabled && !busy && input.trim())
                  e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="button primary"
            aria-label="Skicka meddelande"
            disabled={!enabled || busy || !input.trim()}
          >
            {busy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <ArrowUpRight size={20} />
            )}
          </button>
        </form>
        <p>
          Jarvis kan göra misstag. Verifiera affärskritiska uppgifter. Chatten
          ger råd och ändrar inte din data.
        </p>
      </div>
    </div>
  );
}
