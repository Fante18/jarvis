"use client";
import FeedbackPanel from "../operations/feedback";
import { useOperations } from "@/lib/use-operations";
import { api } from "@/lib/use-workspace";
import { calibration, priority } from "@/lib/automation";
import AnalysisWorkspace from "../analysis/workspace";
import { money } from "@/lib/domain";
import { ArrowUpRight, Lightbulb, Search } from "lucide-react";
import { Badge, Empty } from "../ui";
import type { ViewProps } from "../view-props";
export default function OpportunitiesView({
  state,
  filter,
  setFilter,
  query,
  setQuery,
  setDetail,
}: ViewProps) {
  const { data } = state;
  const ops = useOperations(state, false);
  const rank = (o: (typeof data.opportunities)[number]) =>
    priority(
      o.score,
      o.verified_evidence_count || 0,
      calibration(ops.data.feedback.filter((f) => f.opportunity_id === o.id)),
    );
  return (
    <>
      <AnalysisWorkspace state={state} />
      <FeedbackPanel state={state} ops={ops} />
      <div className="list-toolbar">
        <div className="tabs">
          {[
            ["all", "Alla möjligheter"],
            ["new", "Nya"],
            ["qualified", "Kvalificerade"],
            ["archived", "Arkiverade"],
          ].map(([id, label]) => (
            <button
              className={filter === id ? "active" : ""}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === "all" && <span>{data.opportunities.length}</span>}
            </button>
          ))}
        </div>
        <div className="input-search">
          <Search size={15} />
          <input
            placeholder="Sök möjligheter..."
            aria-label="Sök möjligheter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="opportunity-grid">
        {data.opportunities
          .filter(
            (o) =>
              (filter === "all" || o.status === filter) &&
              `${o.title} ${o.sector}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
          )
          .sort(
            (a, b) =>
              rank(b).verified - rank(a).verified ||
              rank(b).adjusted_score - rank(a).adjusted_score,
          )
          .map((o, i) => (
            <article className="panel opportunity-card" key={o.id}>
              <div className="opportunity-card-top">
                <span className={`opportunity-icon opportunity-${i % 3}`}>
                  <Lightbulb size={21} />
                </span>
                <Badge value={o.status} />
              </div>
              <span className="sector-label">{o.sector}</span>
              <h2>
                <button onClick={() => setDetail(o)}>{o.title}</button>
              </h2>
              <p>{o.description}</p>
              <div className="opportunity-score">
                <span>
                  Prioritering · {o.verified_evidence_count || 0} källcitat
                  kontrollerade
                </span>
                <strong>
                  {rank(o).adjusted_score}
                  <small>/100</small>
                </strong>
                <div>
                  <span style={{ width: `${rank(o).adjusted_score}%` }} />
                </div>
              </div>
              {rank(o).adjusted_score !== o.score && (
                <small>Modellpoäng {o.score} · justerad av testutfall</small>
              )}
              {state.mode === "live" && (
                <button
                  className="button secondary small"
                  disabled={ops.busy}
                  onClick={async () => {
                    try {
                      await api("/api/crm", {
                        method: "POST",
                        body: JSON.stringify({
                          action: "convert",
                          opportunity_id: o.id,
                        }),
                      });
                      await state.reload();
                      state.toast(
                        "Research-lead kopplad till möjligheten. Komplettera verkliga kunduppgifter i Sales.",
                      );
                    } catch (e) {
                      state.toast((e as Error).message);
                    }
                  }}
                >
                  Skapa research-lead i CRM
                </button>
              )}
              <div className="opportunity-card-bottom">
                <div>
                  <span>Uppskattat värde</span>
                  <strong>{money(o.value)}</strong>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Analysera ${o.title}`}
                  onClick={() => setDetail(o)}
                >
                  <ArrowUpRight size={20} />
                </button>
              </div>
            </article>
          ))}
      </div>
      {!data.opportunities.filter(
        (o) =>
          (filter === "all" || o.status === filter) &&
          o.title.toLowerCase().includes(query.toLowerCase()),
      ).length && <Empty text="Inga möjligheter matchar ditt urval." />}
      <p className="help-note">
        Potential och affärsvärde är bedömningar, inte prognoser eller
        garanterade intäkter.
      </p>
    </>
  );
}
