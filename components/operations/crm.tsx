"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import { useOperations, type OperationsState } from "@/lib/use-operations";
import { type SalesDraft } from "@/lib/automation";
import { money } from "@/lib/domain";
import { Mail, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import { Modal } from "../ui";
import { OperationsNotice } from "./overview";
const draftLabels: Record<SalesDraft["status"], string> = {
  draft: "Utkast",
  pending: "Väntar på godkännande",
  approved: "Godkänt, ej skickat",
  rejected: "Avslaget",
  sending: "Sändning startad",
  sent: "Leverans bekräftad av Gmail",
  unknown: "Osäker leverans – kontrollera Gmail",
  failed: "Misslyckat",
};
export default function CrmWorkbench({ state }: { state: WorkspaceState }) {
  const ops = useOperations(state),
    [editor, setEditor] = useState(false),
    [draft, setDraft] = useState<SalesDraft | null>(null),
    [cash, setCash] = useState(false),
    [error, setError] = useState("");
  async function guard(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!ops.live)
    return (
      <p className="help-note">
        CRM-pipelinen kan provas i demo. Riktiga betalningar, AI-förslag och
        mejlanslutning kräver inloggning.
      </p>
    );
  const t = ops.data.totals;
  return (
    <section className="crm-workbench">
      <OperationsNotice ops={ops} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="ops-stats">
        <div className="panel">
          <span>Registrerade inbetalningar</span>
          <strong>{money(Number(t.receipts_cents) / 100)}</strong>
        </div>
        <div className="panel">
          <span>Återbetalningar</span>
          <strong>{money(Number(t.refunds_cents) / 100)}</strong>
        </div>
        <div className="panel">
          <span>Registrerade kostnader</span>
          <strong>{money(Number(t.costs_cents) / 100)}</strong>
        </div>
        <div className="panel">
          <span>Netto efter registrerade kostnader</span>
          <strong>
            {money(
              (Number(t.receipts_cents) -
                Number(t.refunds_cents) -
                Number(t.costs_cents)) /
                100,
            )}
          </strong>
        </div>
      </div>
      <p className="help-note">
        Manuellt registrerade faktiska utfall i SEK. Inte automatiskt verifierat
        mot bank eller bokföring. CRM-värden nedan är affärsvärden och
        prognoser, inte mottagna pengar.
      </p>
      <div className="ops-actions">
        <button className="button primary" onClick={() => setCash(true)}>
          <Plus size={15} />
          Registrera ekonomiskt utfall
        </button>
        <button
          className="button secondary"
          disabled={!state.data.leads.length}
          onClick={() => setEditor(true)}
        >
          <Sparkles size={15} />
          Förbered säljförslag
        </button>
        <button
          className="button secondary small"
          onClick={() => void ops.refresh()}
          disabled={ops.loading}
        >
          <RefreshCw size={14} />
          Uppdatera CRM
        </button>
      </div>
      <details className="panel ops-card">
        <summary>
          Betalningshistorik ({ops.data.cash.length} senaste poster)
        </summary>
        <div className="ops-scroll">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Typ</th>
                <th>Referens</th>
                <th>Belopp</th>
                <th>Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {ops.data.cash.map((c) => (
                <tr key={c.id}>
                  <td>{c.occurred_on}</td>
                  <td>
                    {c.kind === "receipt"
                      ? "Inbetalning"
                      : c.kind === "refund"
                        ? "Återbetalning"
                        : "Kostnad"}
                  </td>
                  <td>
                    {c.reference}
                    {c.evidence_url && (
                      <a href={c.evidence_url} target="_blank" rel="noreferrer">
                        {" "}
                        · underlag ↗
                      </a>
                    )}
                  </td>
                  <td>
                    {money(c.amount_cents / 100)}
                    {c.voided_at ? " · makulerad" : ""}
                  </td>
                  <td>
                    {!c.voided_at && (
                      <button
                        className="text-link"
                        onClick={() => {
                          if (
                            confirm(
                              "Makulera denna registrering? Historiken bevaras. Ingen verklig betalning påverkas.",
                            )
                          )
                            void guard(() =>
                              ops.act("/api/crm", {
                                action: "void_cash",
                                id: c.id,
                              }),
                            );
                        }}
                      >
                        Makulera registrering
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <section className="panel ops-card">
        <div className="section-header">
          <h3>Säljutkast och offerter</h3>
          <Link className="text-link" href="/approvals">
            Granska godkännanden →
          </Link>
        </div>
        {!ops.data.drafts.length && (
          <p className="muted">
            Skapa ett utkast själv eller låt Sales Agent förbereda ett
            personligt erbjudande.
          </p>
        )}
        {ops.data.drafts.map((d) => (
          <button className="draft-row" key={d.id} onClick={() => setDraft(d)}>
            <Mail size={17} />
            <span>
              <strong>{d.subject}</strong>
              <small>
                {d.recipient || "Mottagare saknas"} · {draftLabels[d.status]}
              </small>
            </span>
            <span>Öppna →</span>
          </button>
        ))}
      </section>
      {editor && (
        <DraftEditor state={state} ops={ops} close={() => setEditor(false)} />
      )}
      {cash && (
        <CashEditor state={state} ops={ops} close={() => setCash(false)} />
      )}
      {draft && (
        <Modal
          title="Granska exakt säljutkast"
          onClose={() => setDraft(null)}
          wide
        >
          <p className="muted">Mottagare: {draft.recipient || "Saknas"}</p>
          <h3>{draft.subject}</h3>
          <p className="pre-wrap">{draft.body}</p>
          <p>
            {
              draftLabels[
                ops.data.drafts.find((d) => d.id === draft.id)?.status ||
                  draft.status
              ]
            }
          </p>
          {draft.error && (
            <p role="alert" className="form-error">
              {draft.error}
            </p>
          )}
          <p className="help-note">
            Ändringar kräver ett nytt utkast och ett nytt godkännande. Sändning
            kräver dokumenterat samtycke och att leaden tillåter kontakt.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDraft(null)}>
              Stäng
            </button>
            {(ops.data.drafts.find((d) => d.id === draft.id)?.status ||
              draft.status) === "draft" && (
              <button
                className="button primary"
                disabled={ops.busy}
                onClick={() =>
                  void guard(async () => {
                    await ops.act(`/api/crm/drafts/${draft.id}`, {
                      action: "request_approval",
                    });
                    setDraft(null);
                    await state.reload();
                  })
                }
              >
                Begär godkännande
              </button>
            )}
            {(ops.data.drafts.find((d) => d.id === draft.id)?.status ||
              draft.status) === "approved" && (
              <button
                className="button primary"
                disabled={ops.busy || !ops.data.gmail.email}
                onClick={() => {
                  if (
                    confirm(
                      `Skicka exakt detta godkända meddelande till ${draft.recipient}?`,
                    )
                  )
                    void guard(async () => {
                      await ops.act(`/api/crm/drafts/${draft.id}`, {
                        action: "send",
                      });
                      setDraft(null);
                      await state.reload();
                    });
                }}
              >
                <Send size={15} />
                Skicka godkänt mejl
              </button>
            )}
          </div>
          {!ops.data.gmail.email && (
            <p className="help-note">
              Anslut Gmail i Settings för att kunna skicka efter godkännande.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
function DraftEditor({
  state,
  ops,
  close,
}: {
  state: WorkspaceState;
  ops: OperationsState;
  close: () => void;
}) {
  const [lead, setLead] = useState(state.data.leads[0]?.id || ""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [offer, setOffer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/crm/drafts", {
        method: "POST",
        body: JSON.stringify({ action: "generate", lead_id: lead, offer }),
      });
      setSubject(r.proposal.subject);
      setBody(r.proposal.body);
      await ops.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await ops.act("/api/crm/drafts", { lead_id: lead, subject, body });
      state.toast("Utkast sparat. Ingenting har skickats.");
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Förbered ett erbjudande"
      onClose={close}
      closeDisabled={busy}
      wide
    >
      <form className="form-stack" onSubmit={save}>
        <label>
          Lead
          <select
            value={lead}
            onChange={(e) => {
              setLead(e.target.value);
              setSubject("");
              setBody("");
            }}
          >
            {state.data.leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.company} · {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Erbjudande och kända förutsättningar
          <textarea
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            maxLength={1500}
            rows={3}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy || offer.trim().length < 5 || !state.config.openai}
          onClick={() => void generate()}
        >
          <Sparkles size={15} />
          {busy ? "Arbetar…" : "Skapa AI-förslag inom budgeten"}
        </button>
        <p className="help-note">
          AI-förslag använder OpenAI och räknas mot din dags- och månadsbudget.
          Inga webbsökningar eller utskick görs. Granska alla antaganden.
        </p>
        <label>
          Ämne
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label>
          Meddelande
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            minLength={10}
            maxLength={8000}
            rows={9}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Avbryt
          </button>
          <button className="button primary" disabled={busy}>
            Spara utkast för granskning
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CashEditor({
  state,
  ops,
  close,
}: {
  state: WorkspaceState;
  ops: OperationsState;
  close: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      await ops.act("/api/crm", {
        action: "cash",
        entry: {
          id,
          lead_id: f.get("lead_id") || null,
          opportunity_id: null,
          kind: f.get("kind"),
          amount_cents: Math.round(Number(f.get("amount")) * 100),
          occurred_on: f.get("day"),
          reference: f.get("reference"),
          evidence_url: f.get("evidence_url") || "",
        },
      });
      state.toast(
        "Faktiskt utfall registrerat. Ingen betalning har genomförts av Jarvis.",
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Registrera ett faktiskt ekonomiskt utfall" onClose={close}>
      <form className="form-stack" onSubmit={save}>
        <p className="help-note">
          Registrera redan inträffade händelser. Detta är manuell dokumentation,
          ingen betalningsfunktion.
        </p>
        <label>
          Typ
          <select name="kind">
            <option value="receipt">Mottagen inbetalning</option>
            <option value="refund">Genomförd återbetalning</option>
            <option value="cost">Betald kostnad</option>
          </select>
        </label>
        <label>
          Lead (valfri)
          <select name="lead_id">
            <option value="">Ingen koppling</option>
            {state.data.leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.company}
              </option>
            ))}
          </select>
        </label>
        <label>
          Belopp i SEK
          <input
            name="amount"
            type="number"
            required
            min="0.01"
            max="1000000000"
            step="0.01"
          />
        </label>
        <label>
          Händelsedatum
          <input
            name="day"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label>
          Unik referens, exempelvis fakturanummer
          <input name="reference" required maxLength={200} />
        </label>
        <label>
          Underlag (https, valfritt)
          <input name="evidence_url" type="url" />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Avbryt
          </button>
          <button className="button primary" disabled={ops.busy}>
            Registrera utfall
          </button>
        </div>
      </form>
    </Modal>
  );
}
