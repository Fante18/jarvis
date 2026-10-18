"use client";
import Link from "next/link";
import { useOperations, type OperationsState } from "@/lib/use-operations";
import type { WorkspaceState } from "@/lib/use-workspace";
import { money } from "@/lib/domain";
import { usd } from "@/lib/analysis/contracts";
import {
  Activity,
  RefreshCw,
  ShieldCheck,
  Wallet,
  CalendarClock,
} from "lucide-react";
export function OperationsNotice({ ops }: { ops: OperationsState }) {
  return ops.error ? (
    <p role="alert" className="form-error">
      {ops.error}{" "}
      <button className="text-link" onClick={() => void ops.refresh()}>
        Försök igen
      </button>
    </p>
  ) : null;
}
export default function OperationsOverview({
  state,
}: {
  state: WorkspaceState;
}) {
  const ops = useOperations(state),
    { data: d } = ops;
  if (!ops.live) return null;
  const running = d.analyses.filter((j) =>
    ["running", "queued"].includes(j.status),
  );
  const net =
    (Number(d.totals.receipts_cents) - Number(d.totals.refunds_cents)) / 100;
  return (
    <section className="operations-overview" aria-label="Daglig överblick">
      <div className="section-header">
        <h2>Din dagliga överblick</h2>
        <button
          className="button secondary small"
          disabled={ops.loading}
          onClick={() => void ops.refresh()}
        >
          <RefreshCw size={14} /> Uppdatera överblick
        </button>
      </div>
      <OperationsNotice ops={ops} />
      <div className="ops-stats">
        <div className="panel">
          <Wallet size={17} />
          <span>Registrerade inbetalningar, netto</span>
          <strong>{money(net)}</strong>
          <small>
            Inbetalningar minus återbetalningar · manuellt registrerat
          </small>
        </div>
        <div className="panel">
          <Activity size={17} />
          <span>API-budget använd / reserverad idag</span>
          <strong>{usd(d.daily_microusd)}</strong>
          <small>
            Tak ${(d.controls.daily_limit_cents / 100).toFixed(2)} · UTC-dygn ·
            beräknat, inte faktura
          </small>
        </div>
        <div className="panel">
          <ShieldCheck size={17} />
          <span>Kräver ditt beslut</span>
          <strong>
            {state.data.approvals.filter((a) => a.status === "pending").length}
          </strong>
          <Link href="/approvals">Granska åtgärder →</Link>
        </div>
        <div className="panel">
          <CalendarClock size={17} />
          <span>Aktiva analyskörningar</span>
          <strong>{running.length}</strong>
          <small>
            {d.controls.enabled
              ? "Schemaläggning aktiverad"
              : "Automatisering pausad"}{" "}
            · {d.digest?.followups || 0} uppföljningar förfallna
          </small>
        </div>
      </div>
      <CashChart points={d.trend} />
      <div className="ops-columns">
        <section className="panel ops-card">
          <h3>Dagens fynd och förändringar</h3>
          {d.digest?.findings.length ? (
            d.digest.findings.map((f) => (
              <article className="digest-finding" key={f.id}>
                <Link href={`/chat?analysis_id=${f.analysis_id}`}>
                  {f.title}
                </Link>
                <span>
                  {f.score}/100 · {f.verified} kontrollerade källcitat{" "}
                  {f.change !== null
                    ? `· förändring ${f.change >= 0 ? "+" : ""}${f.change}`
                    : "· första analys"}
                </span>
                <p>{f.next_step}</p>
                <div className="source-links">
                  {f.sources.slice(0, 3).map((url, i) => (
                    <a href={url} key={url} target="_blank" rel="noreferrer">
                      Källa {i + 1} ↗
                    </a>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="muted">
              Inga färdiga fynd idag. Skapa ett skanningsschema i Settings eller
              starta en analys manuellt.
            </p>
          )}
          <small className="muted">{d.digest?.note}</small>
        </section>
        <section className="panel ops-card">
          <h3>Pågår och nästa åtgärder</h3>
          {running.map((j) => (
            <p key={j.id}>
              <Link href={`/chat?analysis_id=${j.id}`}>{j.topic}</Link>
              <br />
              <small>
                {j.active_role || "Köad"} · {j.step_count}/
                {j.include_sales ? 8 : 7} steg ·{" "}
                {usd(j.spent_microusd + j.reserved_microusd)}{" "}
                beräknat/reserverat
              </small>
            </p>
          ))}
          {!running.length && (
            <p className="muted">Inga analyser körs just nu.</p>
          )}
          <h4>Prioriterade öppna affärer</h4>
          {state.data.leads
            .filter((l) => !["won", "lost"].includes(l.stage))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
            .map((l) => (
              <p key={l.id}>
                <Link href="/sales">{l.company}</Link> · {money(l.value)}{" "}
                prognos
              </p>
            ))}
          <p>
            Kostnader:{" "}
            <strong>{money(Number(d.totals.costs_cents) / 100)}</strong> · Netto
            efter registrerade kostnader:{" "}
            <strong>{money(net - Number(d.totals.costs_cents) / 100)}</strong>
          </p>
          <Link className="text-link" href="/settings">
            Styr scheman och budget →
          </Link>
        </section>
      </div>
    </section>
  );
}

function CashChart({
  points,
}: {
  points: { day: string; net_cents: number }[];
}) {
  const totals = points.map((_, i) =>
    points.slice(0, i + 1).reduce((a, p) => a + Number(p.net_cents) / 100, 0),
  );
  const min = Math.min(0, ...totals),
    max = Math.max(1, ...totals),
    height = (v: number) => 155 - ((v - min) / (max - min)) * 125;
  const path = totals
    .map(
      (v, i) =>
        `${30 + (i * 510) / Math.max(1, totals.length - 1)},${height(v)}`,
    )
    .join(" ");
  return (
    <section className="panel ops-card">
      <h3>Registrerat kassaflöde · senaste 30 dagarna</h3>
      <p>
        Inbetalningar minus återbetalningar och betalda kostnader. Baserat på
        händelsedatum.
      </p>
      <svg
        viewBox="0 0 570 200"
        role="img"
        aria-label={`Registrerat nettokassaflöde 30 dagar: ${money(totals.at(-1) || 0)}`}
        style={{ width: "100%", maxHeight: 220 }}
      >
        <line
          x1="30"
          x2="540"
          y1={height(0)}
          y2={height(0)}
          stroke="#33455b"
          strokeDasharray="4 4"
        />
        <polyline
          points={path}
          fill="none"
          stroke="#58d9ce"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <text x="30" y="187" fill="#8ea6b8" fontSize="11">
          {points[0]?.day || ""}
        </text>
        <text x="540" y="187" textAnchor="end" fill="#8ea6b8" fontSize="11">
          {points.at(-1)?.day || ""}
        </text>
        <text x="30" y="18" fill="#d7e9f2" fontSize="14">
          {money(totals.at(-1) || 0)}
        </text>
      </svg>
    </section>
  );
}
