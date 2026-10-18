"use client";
import CrmWorkbench from "../operations/crm";
import { money } from "@/lib/domain";
import { Trash2 } from "lucide-react";
import { statusLabels } from "../ui";
import type { ViewProps } from "../view-props";
export default function SalesView({
  state,
  stats,
  filter,
  openEditor,
  setDeleteTarget,
  guardError,
}: ViewProps) {
  const { data } = state;
  return (
    <>
      <CrmWorkbench state={state} />
      <div className="sales-stats">
        {[
          ["Pipeline", money(stats.pipeline)],
          ["Vunnet affärsvärde", money(stats.revenue)],
          ["Andel vunna leads", `${stats.conversion}%`],
          ["Totalt antal leads", String(data.leads.length)],
        ].map(([l, v]) => (
          <div className="panel" key={l}>
            <span>{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="section-header">
        <h2>Din pipeline</h2>
        <span className="muted">Öppna en lead för att ändra steg</span>
      </div>
      <div className="pipeline">
        {["new", "contacted", "proposal", "won", "lost"].map((stage) => (
          <section className={`pipeline-column pipeline-${stage}`} key={stage}>
            <div className="pipeline-heading">
              <span className="tiny-dot" />
              <h3>{statusLabels[stage]}</h3>
              <span>{data.leads.filter((l) => l.stage === stage).length}</span>
              <strong>
                {money(
                  data.leads
                    .filter((l) => l.stage === stage)
                    .reduce((s, l) => s + l.value, 0),
                  true,
                )}
              </strong>
            </div>
            {data.leads
              .filter((l) => l.stage === stage)
              .map((l) => (
                <article className="lead-card" key={l.id}>
                  <button
                    className="lead-main"
                    onClick={() => openEditor("leads", l)}
                  >
                    <span className="company-avatar">
                      {l.company.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{l.company}</strong>
                    <span>{l.name}</span>
                    <b>{money(l.value)}</b>
                  </button>
                  <div className="lead-footer">
                    <select
                      aria-label={`Försäljningssteg för ${l.company}`}
                      value={l.stage}
                      onChange={(e) => {
                        const p = Object.fromEntries(
                          Object.entries(l).filter(
                            ([k]) =>
                              ![
                                "id",
                                "user_id",
                                "created_at",
                                "updated_at",
                              ].includes(k),
                          ),
                        );
                        guardError(() =>
                          state.mutate(
                            "leads",
                            { ...p, stage: e.target.value },
                            l.id,
                          ),
                        );
                      }}
                    >
                      {["new", "contacted", "proposal", "won", "lost"].map(
                        (s) => (
                          <option value={s} key={s}>
                            {statusLabels[s]}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      className="icon-button danger"
                      aria-label={`Ta bort ${l.company}`}
                      onClick={() =>
                        setDeleteTarget({ entity: "leads", id: l.id })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              ))}
            {!data.leads.some((l) => l.stage === stage) && (
              <div className="pipeline-empty">Inga leads i det här steget</div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
