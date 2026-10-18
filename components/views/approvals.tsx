"use client";
import { money } from "@/lib/domain";
import Link from "next/link";
import { Check, ShieldCheck, X } from "lucide-react";
import { Badge, Empty, statusLabels } from "../ui";
import type { ViewProps } from "../view-props";
export default function ApprovalsView({
  state,
  filter,
  setFilter,
  guardError,
}: ViewProps) {
  const { data } = state;
  const pending = data.approvals.filter((a) => a.status === "pending").length;
  return (
    <>
      <div className="approval-info">
        <ShieldCheck size={22} />
        <div>
          <strong>Ditt beslut, din kontroll.</strong>
          <p>
            Godkännanden dokumenterar beslutet. Externa utskick, köp och
            investeringar utförs inte automatiskt.
          </p>
        </div>
      </div>
      <div className="tabs approval-tabs">
        {[
          ["all", "Alla förslag"],
          ["pending", "Väntar på beslut"],
          ["approved", "Godkända"],
          ["rejected", "Avslagna"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={filter === v ? "active" : ""}
          >
            {l}
            {v === "pending" && <span>{pending}</span>}
          </button>
        ))}
      </div>
      <div className="approval-list">
        {data.approvals
          .filter((a) => filter === "all" || a.status === filter)
          .map((a) => (
            <article className="panel approval-card" key={a.id}>
              <div className="approval-icon">
                <ShieldCheck size={23} />
              </div>
              <div className="approval-content">
                <div>
                  <Badge value={a.status} />
                  <span className={`risk-label risk-${a.risk}`}>
                    {statusLabels[a.risk]} risk
                  </span>
                  <span className="muted">
                    {new Date(a.created_at).toLocaleDateString("sv-SE")}
                  </span>
                </div>
                <h2>{a.title}</h2>
                <p className="pre-wrap">{a.description}</p>
                {a.source_analysis_id && (
                  <p>
                    <Link href={`/chat?analysis_id=${a.source_analysis_id}`}>
                      Läs agenternas affärsunderlag och källor →
                    </Link>
                  </p>
                )}
                <small>
                  Typ: {a.action_type} · Uppskattad kostnad: {money(a.amount)}
                </small>
                {a.decided_at && (
                  <small>
                    Beslut registrerat{" "}
                    {new Date(a.decided_at).toLocaleString("sv-SE")}
                  </small>
                )}
              </div>
              {a.status === "pending" && (
                <div className="approval-actions">
                  <button
                    className="button primary small"
                    disabled={state.busy}
                    onClick={() =>
                      guardError(() =>
                        state.mutate("approvals", { status: "approved" }, a.id),
                      )
                    }
                  >
                    <Check size={15} />
                    Godkänn
                  </button>
                  <button
                    className="button secondary small"
                    disabled={state.busy}
                    onClick={() =>
                      guardError(() =>
                        state.mutate("approvals", { status: "rejected" }, a.id),
                      )
                    }
                  >
                    <X size={15} />
                    Avslå
                  </button>
                </div>
              )}
            </article>
          ))}
      </div>
      {!data.approvals.filter((a) => filter === "all" || a.status === filter)
        .length && <Empty text="Inga förslag i den här kategorin." />}
    </>
  );
}
