"use client";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import {
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Play,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import Link from "next/link";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import {
  specialists,
  agentRoles,
  dimensionKeys,
  usd,
  type AnalysisJob,
  type AnalysisSummary,
  type AnalysisRequest,
} from "@/lib/analysis/contracts";
import { planAnalysis } from "@/lib/analysis/policy";
import { money, safeSourceUrl } from "@/lib/domain";
import { Modal } from "../ui";
const labels = {
  queued: "I kö",
  running: "Analyserar",
  completed: "Slutförd",
  failed: "Avbruten / fel",
  cancelled: "Stoppad",
  budget_exceeded: "Budgetgräns nådd",
};
const dimensions = {
  demand: "Efterfrågan",
  feasibility: "Genomförbarhet",
  customer_access: "Kundåtkomst",
  economics: "Ekonomi",
  risk: "Riskhantering",
};
export default function AnalysisWorkspace({
  state,
  initialTopic = "",
  compact = false,
  opportunityId,
}: {
  state: WorkspaceState;
  initialTopic?: string;
  compact?: boolean;
  opportunityId?: string;
}) {
  const [jobs, setJobs] = useState<AnalysisSummary[]>([]);
  const [open, setOpen] = useState(false);
  const detailId = useRef<string | null>(null);
  const [detail, setDetail] = useState<AnalysisJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const live = state.mode === "live";
  const enabled = live && state.config.openai;
  useEffect(() => {
    if (
      compact &&
      new URLSearchParams(window.location.search).get("analysis") === "1"
    )
      setOpen(true);
  }, [compact]);
  useEffect(() => {
    if (!live) return;
    const id = new URLSearchParams(window.location.search).get("analysis_id");
    if (!id) return;
    let current = true;
    api(`/api/ai/analyses/${encodeURIComponent(id)}`)
      .then((r) => {
        if (current) {
          detailId.current = id;
          setDetail(r.analysis);
        }
      })
      .catch((e) => {
        if (current) setError((e as Error).message);
      });
    return () => {
      current = false;
    };
  }, [live]);
  const load = useCallback(async () => {
    if (!live) return;
    try {
      const r = await api("/api/ai/analyses");
      setJobs(r.analyses);
      if (detailId.current) {
        const id = detailId.current;
        const d = await api(`/api/ai/analyses/${id}`);
        if (detailId.current === id) setDetail(d.analysis);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [live]);
  useEffect(() => {
    load();
  }, [load]);
  const active = jobs.some((j) => ["queued", "running"].includes(j.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [active, load]);
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const input: AnalysisRequest = {
        topic: String(f.get("topic")),
        notes: String(f.get("notes") || ""),
        budget_cents: Math.round(Number(f.get("budget")) * 100),
        include_sales: f.get("sales") === "on",
      };
      const started = await api("/api/ai/analyses", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await load();
      setOpen(false);
      state.toast(
        started.reused
          ? "En färsk analys för samma uppdrag återanvänds. Inget nytt API-anrop gjordes."
          : "Jarvis har startat analysen. Du kan följa varje steg här.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, action: "cancel" | "resume") {
    setBusy(true);
    try {
      await api(`/api/ai/analyses/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
      state.toast(
        action === "cancel"
          ? "Stopp begärt. Ett pågående API-anrop kan behöva avslutas först."
          : "Återupptagning begärd. Sparade steg körs inte om.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = opportunityId
    ? jobs.filter((j) => j.opportunity_id === opportunityId)
    : jobs.slice(0, compact ? 3 : 10);
  return (
    <section
      className={`analysis-workspace panel ${compact ? "analysis-compact" : ""}`}
    >
      <div className="panel-heading">
        <div>
          <h2>
            <Bot size={17} />
            Jarvis analysflöde
          </h2>
          <p>
            Scout → Research → Validator → Strategist → Finance → Critic →
            Jarvis
          </p>
        </div>
        <button className="button primary small" onClick={() => setOpen(true)}>
          <Play size={13} />
          Starta affärsanalys
        </button>
      </div>
      {!compact && (
        <div className="specialist-strip">
          {agentRoles
            .filter((r) => r !== "jarvis")
            .map((r) => (
              <div key={r}>
                <span className="tiny-dot" />
                {specialists[r].name}
                {r === "sales" && <small>valfri</small>}
              </div>
            ))}
        </div>
      )}
      {!enabled && (
        <p className="analysis-config">
          <ShieldCheck size={14} />
          Riktiga analyser kräver Supabase och OpenAI. Ingen AI-analys simuleras
          i demoläge.
          <Link href="/settings">
            Konfigurera
            <ChevronRight size={12} />
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="analysis-job-list">
        {shown.map((j) => (
          <article className="analysis-job" key={j.id}>
            <button
              className="analysis-job-main"
              onClick={async () => {
                try {
                  const r = await api(`/api/ai/analyses/${j.id}`);
                  detailId.current = j.id;
                  setDetail(r.analysis);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <span className={`analysis-status analysis-${j.status}`}>
                {j.status === "running" ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Bot size={14} />
                )}{" "}
                {labels[j.status]}
              </span>
              <strong>{j.topic}</strong>
              <span>
                {j.step_count} / {planAnalysis(j).length} steg ·{" "}
                {usd(j.spent_microusd)} + {usd(j.reserved_microusd)} reserverat
                · tak ${(j.budget_cents / 100).toFixed(2)}
              </span>
              {j.active_role && (
                <small>{specialists[j.active_role].name} arbetar</small>
              )}
              {j.report && (
                <b>{j.report.scorecard.total}/100 · Prioriteringspoäng</b>
              )}
              <ChevronRight size={16} />
            </button>
            {["queued", "running"].includes(j.status) && (
              <button
                className="icon-button danger"
                aria-label={`Stoppa ${j.topic}`}
                disabled={busy || j.cancel_requested}
                onClick={() => action(j.id, "cancel")}
              >
                <Square size={13} />
              </button>
            )}
            {(j.status === "failed" ||
              (["running", "queued"].includes(j.status) &&
                j.lease_until &&
                Date.parse(j.lease_until) < Date.now())) && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => action(j.id, "resume")}
              >
                Återuppta
              </button>
            )}
          </article>
        ))}
      </div>
      {live && !shown.length && (
        <p className="analysis-empty">
          Inga analyser ännu. Börja med ett avgränsat offentligt problem eller
          en marknad.
        </p>
      )}
      {open && (
        <Modal
          title="Starta Jarvis affärsanalys"
          onClose={() => setOpen(false)}
          wide
        >
          <form onSubmit={start} className="form-stack">
            <p className="modal-description">
              Jarvis samordnar sju steg och sparar källor, bedömningar och
              resultat. Sales kan läggas till före Critic. Inget skickas eller
              publiceras externt.
            </p>
            <label>
              Offentligt sökområde
              <textarea
                name="topic"
                defaultValue={initialTopic}
                minLength={10}
                maxLength={500}
                required
                rows={3}
                placeholder="Exempel: administration och betalningsvilja hos mindre svenska redovisningsbyråer"
              />
            </label>
            <p className="help-note">
              Sökområdet får användas i offentliga sökfrågor. Lägg inte
              hemligheter eller personuppgifter här.
            </p>
            <label>
              Privat bakgrund (används som AI-underlag, inte som sökfråga)
              <textarea name="notes" maxLength={1500} rows={2} />
            </label>
            <label>
              Högsta API-budget per analys (USD)
              <input
                name="budget"
                type="number"
                min="1.20"
                max="2.00"
                step=".10"
                defaultValue="1.50"
                required
              />
            </label>
            <label className="analysis-checkbox">
              <input type="checkbox" name="sales" />
              Inkludera Sales Agent: strategi och kontaktutkast för granskning
            </label>
            <p className="help-note">
              Budget reserveras före varje anrop, med konservativ kostnadsram
              för webbsökning. Två söksteg reserverar $0.50 vardera. 7–8 steg
              med högst två extra anropsförsök, 45 sekunder per steg, 4 minuter
              totalt och 10 start-/återupptagningsförsök per timme. Vid oklart
              API-fel behålls reservationen.
            </p>
            {!enabled && (
              <div className="config-callout">
                Anslut Supabase och OPENAI_API_KEY via serverns miljövariabler.
                Alla fyra databas-migrationer behövs.
                <Link href="/settings">Till konfiguration</Link>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Stäng
              </button>
              <button
                className="button primary"
                disabled={!enabled || busy || active}
              >
                {busy ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Play size={14} />
                )}
                Starta komplett analys
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title="Jarvis · affärsanalys"
          onClose={() => {
            detailId.current = null;
            setDetail(null);
          }}
          wide
        >
          <AnalysisReport job={detail} />
        </Modal>
      )}
    </section>
  );
}
function AnalysisReport({ job }: { job: AnalysisJob }) {
  const report = job.report;
  const sources = [
    ...new Map(
      job.results.flatMap((r) => r.sources).map((s) => [s.url, s]),
    ).values(),
  ];
  return (
    <div className="analysis-report">
      <h3>{job.topic}</h3>
      <p className="help-note">
        {labels[job.status]} ·{" "}
        {new Date(job.created_at).toLocaleString("sv-SE")} · beräknad
        API-användning {usd(job.spent_microusd)} · reserverat{" "}
        {usd(job.reserved_microusd)}
      </p>
      {job.error && <p className="form-error">{job.error}</p>}
      {report && (
        <>
          <div className="analysis-score">
            <strong>
              {report.scorecard.total}
              <small>/100</small>
            </strong>
            <div>
              <h4>Prioriteringspoäng</h4>
              <p>
                Betalningsvilja: ej empiriskt validerad. Ingen garanterad
                framgångssannolikhet.
              </p>
            </div>
          </div>
          <h4>
            Rekommendation:{" "}
            {
              {
                test: "Validera först",
                proceed_cautiously: "Fortsätt försiktigt",
                reject: "Avstå",
                insufficient_evidence: "Otillräckligt underlag",
              }[report.recommendation]
            }
          </h4>
          <p>{report.summary}</p>
          <p className="help-note">
            AI-bedömning, inte ett verifierat sakförhållande. Endast ordagranna
            källcitat kontrolleras automatiskt.
          </p>
          <div className="score-dimensions">
            {dimensionKeys.map((k) => (
              <div key={k}>
                <span>
                  {dimensions[k]} ·{" "}
                  {Math.round(report.scorecard.weights[k] * 100)}%
                </span>
                <strong>{report.scorecard.dimensions[k].score}/100</strong>
                <p>{report.scorecard.dimensions[k].reason}</p>
              </div>
            ))}
          </div>
          <ul className="analysis-limitations">
            {report.scorecard.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <h4>Konkreta valideringstester</h4>
          {report.validation_tests.map((t, i) => (
            <div className="analysis-test" key={i}>
              <strong>{t.test}</strong>
              <p>Mätetal: {t.metric}</p>
              <p>
                Godkänt: {t.pass_criterion} · Stoppa: {t.stop_criterion}
              </p>
              <small>
                Uppskattad kostnad {money(t.estimated_cost_sek)} · {t.days}{" "}
                dagar · ej genomfört
              </small>
            </div>
          ))}
          <h4>Ekonomiska scenarier — hypotetiska antaganden</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SCENARIO</th>
                  <th>KUNDER*</th>
                  <th>MÅNADSINTÄKT*</th>
                  <th>MÅNADSRESULTAT*</th>
                  <th>BRUTTOMARGINAL*</th>
                  <th>BREAK-EVEN*</th>
                </tr>
              </thead>
              <tbody>
                {report.scenarios.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.customers}</td>
                    <td>{money(s.monthly_revenue_sek)}</td>
                    <td>{money(s.monthly_profit_sek)}</td>
                    <td>
                      {s.gross_margin_percent === null
                        ? "Ej beräkningsbar"
                        : s.gross_margin_percent.toFixed(1) + "%"}
                    </td>
                    <td>
                      {s.breakeven_customers === null
                        ? "Ej möjlig"
                        : s.breakeven_customers + " kunder"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help-note">
            *Scenariovärden, inga verkliga kunder eller intäkter. Noll
            omsättning ger ingen beräknad marginal. Negativt täckningsbidrag ger
            ingen möjlig break-even.
          </p>
          <h4>Critics risker & nästa steg</h4>
          <ul>
            {report.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <ol>
            {report.next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      <h4>Agenternas analyser & körhistorik</h4>
      {job.results.map((r, i) => (
        <details className="analysis-step" key={r.role}>
          <summary>
            <Check size={14} />
            <strong>
              {i + 1}. {specialists[r.role].name}
            </strong>
            <span>
              {usd(r.cost_microusd)} · {r.input_tokens + r.output_tokens} tokens
            </span>
          </summary>
          <p>{r.output.summary}</p>
          {r.output.market_research && (
            <div className="finance-assumptions">
              <h4>Marknadsunderlag</h4>
              <p>Målgrupper: {r.output.market_research.segments.join(" · ")}</p>
              <p>
                Marknadsstorlek (
                {r.output.market_research.market_size.kind === "estimate"
                  ? "uppskattning"
                  : r.output.market_research.market_size.kind === "unknown"
                    ? "okänd"
                    : "kontrollerat citat"}
                ): {r.output.market_research.market_size.text}
              </p>
              <p>Efterfrågan: {r.output.market_research.demand_evidence}</p>
              {r.output.market_research.competitors.map((c, i) => (
                <div key={i}>
                  <strong>{c.name}</strong>
                  <p>{c.offer}</p>
                  {c.source_urls
                    .filter(
                      (u) =>
                        sources.some((s) => s.url === u) && safeSourceUrl(u),
                    )
                    .map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Dokumenterad källa
                        <ExternalLink size={11} />
                      </a>
                    ))}
                </div>
              ))}
            </div>
          )}
          {r.output.contact_draft && (
            <div className="finance-assumptions">
              <h4>Kontaktutkast — ej skickat</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.output.contact_draft}</p>
            </div>
          )}
          {r.claims.map((c, n) => (
            <div className="analysis-claim" key={n}>
              <span className={`claim-kind claim-${c.kind}`}>
                {c.kind === "fact"
                  ? "Källcitat verifierat"
                  : c.kind === "estimate"
                    ? "Uppskattning"
                    : "Hypotes"}
              </span>
              <p>{c.statement}</p>
              {c.quote && <blockquote>{c.quote}</blockquote>}
              {c.warning && <small>{c.warning}</small>}
              {c.source_urls
                .filter((u) => safeSourceUrl(u))
                .map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                    Källa
                    <ExternalLink size={11} />
                  </a>
                ))}
            </div>
          ))}
          {r.output.financial_assumptions && (
            <div className="finance-assumptions">
              <h4>Hypotetiska månadsantaganden</h4>
              <p>
                Pris/kund: {money(r.output.financial_assumptions.price_sek)} ·
                Rörlig kostnad/kund:{" "}
                {money(r.output.financial_assumptions.variable_cost_sek)} ·
                Fasta kostnader:{" "}
                {money(r.output.financial_assumptions.fixed_cost_sek)}
              </p>
              <p>
                Antagna kunder:{" "}
                {r.output.financial_assumptions.assumed_customers} ·
                Anskaffningskostnad/kund:{" "}
                {money(r.output.financial_assumptions.acquisition_cost_sek)} ·
                Startkostnad:{" "}
                {money(r.output.financial_assumptions.startup_cost_sek)}
              </p>
              <p>{r.output.financial_assumptions.rationale}</p>
            </div>
          )}
          {r.role === "sales" && (
            <p className="help-note">
              Kontaktförslag är utkast. Inga kontakter har tagits. Granska
              säljplanen: {r.output.plan.join(" · ")}
            </p>
          )}
        </details>
      ))}
      <h4>Dokumenterade källor ({sources.length})</h4>
      {sources.map((s) => (
        <div className="analysis-source" key={s.url}>
          {safeSourceUrl(s.url) && (
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
              <ExternalLink size={12} />
            </a>
          )}
          <small>
            {s.provider} · hämtad{" "}
            {new Date(s.retrieved_at).toLocaleString("sv-SE")}
          </small>
          {s.excerpt && <p>{s.excerpt}</p>}
          <small>
            Hämtad källa innebär inte att alla dess sakpåståenden är oberoende
            verifierade.
          </small>
        </div>
      ))}
      {!sources.length && (
        <p className="help-note">Inga dokumenterade källor finns ännu.</p>
      )}
    </div>
  );
}
