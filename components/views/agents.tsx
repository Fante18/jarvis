"use client";
import AnalysisWorkspace from "../analysis/workspace";
import { Activity, Bot, ChevronDown, Pause, Play, Trash2 } from "lucide-react";
import { Badge, Empty } from "../ui";
import type { ViewProps } from "../view-props";
export default function AgentsView({
  state,
  stats,
  openEditor,
  setRunAgent,
  setDeleteTarget,
  guardError,
}: ViewProps) {
  const { data, mode } = state;
  return (
    <>
      <AnalysisWorkspace state={state} />
      <div className="summary-strip">
        <span>
          <Bot size={17} />
          <strong>{data.agents.length}</strong> agenter
        </span>
        <span>
          <span className="status-dot" />
          <strong>{stats.activeAgents}</strong> redo
        </span>
        <span>
          <Activity size={16} />
          <strong>{data.agent_runs.length}</strong> körningar
        </span>
        <span>Manuell start · inga dolda scheman</span>
      </div>
      <div className="agent-cards">
        {data.agents.map((a, i) => (
          <article className="panel agent-card" key={a.id}>
            <div className="agent-card-top">
              <div className={`agent-icon agent-color-${i % 3}`}>
                <Bot size={24} />
              </div>
              <Badge value={a.status} />
            </div>
            <h2>{a.name}</h2>
            <p>{a.description}</p>
            <div className="agent-budget">
              <span>Tokenbudget</span>
              <strong>${(a.budget_cents / 100).toFixed(2)} / körning</strong>
            </div>
            <div className="card-actions">
              <button
                className="button primary small"
                onClick={() => setRunAgent(a)}
              >
                <Play size={14} />
                Kör agent
              </button>
              <button
                className="button secondary small"
                onClick={() => openEditor("agents", a)}
              >
                Redigera
              </button>
              <button
                className="icon-button"
                aria-label={
                  a.status === "active" ? "Pausa agent" : "Aktivera agent"
                }
                onClick={() => {
                  const { id, created_at, updated_at, ...p } = a;
                  guardError(() =>
                    state.mutate(
                      "agents",
                      {
                        ...p,
                        status: a.status === "active" ? "paused" : "active",
                      },
                      id,
                    ),
                  );
                }}
              >
                {a.status === "active" ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
              </button>
              <button
                className="icon-button danger"
                aria-label="Ta bort agent"
                onClick={() => setDeleteTarget({ entity: "agents", id: a.id })}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!data.agents.length && (
        <Empty text="Skapa en agent med ett tydligt uppdrag." />
      )}
      <section className="panel run-history">
        <div className="panel-heading">
          <h2>Körhistorik</h2>
          <span className="muted">Senaste 200 körningarna</span>
        </div>
        {data.agent_runs.length ? (
          <div className="run-list">
            {data.agent_runs.map((r) => (
              <details className="run-item" key={r.id}>
                <summary>
                  <Bot size={16} />
                  <strong>
                    {data.agents.find((a) => a.id === r.agent_id)?.name ||
                      "Borttagen agent"}
                  </strong>
                  <Badge value={r.status} />
                  <span>{new Date(r.created_at).toLocaleString("sv-SE")}</span>
                  <ChevronDown size={15} />
                </summary>
                <div className="run-output">
                  {r.input && (
                    <>
                      <h4>Uppdrag</h4>
                      <p>{r.input}</p>
                      <h4>Resultat</h4>
                    </>
                  )}
                  <p>
                    {r.error ||
                      r.output ||
                      "Körningen pågår. Ladda om för aktuell status."}
                  </p>
                  <small>
                    {r.model ? r.model + " · " : ""}
                    {r.tokens || 0} tokens ·{" "}
                    {r.completed_at
                      ? "Avslutad " +
                        new Date(r.completed_at).toLocaleTimeString("sv-SE")
                      : "Inte avslutad"}
                  </small>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty text="Inga körningar ännu. Kör en agent när OpenAI är anslutet." />
        )}
      </section>
    </>
  );
}
