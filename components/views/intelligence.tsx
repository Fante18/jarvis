"use client";
import { safeSourceUrl } from "@/lib/domain";
import {
  ExternalLink,
  Globe,
  MoreHorizontal,
  Radio,
  Trash2,
} from "lucide-react";
import ResearchFiles from "../research-files";
import { Badge, Empty } from "../ui";
import type { ViewProps } from "../view-props";
export default function IntelligenceView({
  state,
  filter,
  setFilter,
  openEditor,
  setRunAgent,
  setDeleteTarget,
}: ViewProps) {
  const { data } = state;
  return (
    <>
      <div className="intel-summary panel">
        <div className="intel-globe">
          <Globe size={34} />
        </div>
        <div>
          <span className="eyebrow">DINA MARKNADSRADAR</span>
          <h2>Små signaler. Större perspektiv.</h2>
          <p>
            Samla källor, granska belägg och låt researchagenter utforska dina
            fokusområden.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            const a = data.agents.find((a) => a.kind === "research");
            a ? setRunAgent(a) : openEditor("agents");
          }}
        >
          <Radio size={16} />
          Starta research
        </button>
      </div>
      <div className="list-toolbar">
        <div className="tabs">
          {[
            ["all", "Alla signaler"],
            ["high", "Hög signalstyrka"],
            ["medium", "Medel"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">
          {data.signals.length} dokumenterade signaler
        </span>
      </div>
      <div className="signals-grid">
        {data.signals
          .filter((s) => filter === "all" || s.strength === filter)
          .map((s) => (
            <article className="panel signal-card" key={s.id}>
              <div className="signal-top">
                <span className="sector-label">
                  <Radio size={13} />
                  {s.sector}
                </span>
                <Badge value={s.strength} />
              </div>
              <h2>{s.title}</h2>
              <p>{s.description}</p>
              <div className="signal-footer">
                <span>
                  {new Date(s.published_at).toLocaleDateString("sv-SE")}
                </span>
                {safeSourceUrl(s.source_url) && (
                  <a
                    href={safeSourceUrl(s.source_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Granska källa
                    <ExternalLink size={13} />
                  </a>
                )}
                <button
                  className="icon-button"
                  onClick={() => openEditor("signals", s)}
                  aria-label="Redigera signal"
                >
                  <MoreHorizontal size={17} />
                </button>
                <button
                  className="icon-button danger"
                  onClick={() =>
                    setDeleteTarget({ entity: "signals", id: s.id })
                  }
                  aria-label="Ta bort signal"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
      </div>
      {!data.signals.length && (
        <Empty text="Lägg till din första källbelagda marknadssignal." />
      )}
      <ResearchFiles state={state} />
    </>
  );
}
