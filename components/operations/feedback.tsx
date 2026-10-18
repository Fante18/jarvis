"use client";
import { useState, type FormEvent } from "react";
import type { WorkspaceState } from "@/lib/use-workspace";
import type { OperationsState } from "@/lib/use-operations";
import { calibration } from "@/lib/automation";
import { statusLabels } from "../ui";
export default function FeedbackPanel({
  state,
  ops,
}: {
  state: WorkspaceState;
  ops: OperationsState;
}) {
  const [opId, setOpId] = useState(state.data.opportunities[0]?.id || ""),
    [error, setError] = useState("");
  if (!ops.live) return null;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setError("");
    try {
      await ops.act("/api/crm", {
        action: "feedback",
        feedback: {
          opportunity_id: opId,
          analysis_id:
            state.data.opportunities.find((o) => o.id === opId)
              ?.origin_analysis_id || null,
          test_reference: f.get("test_reference"),
          sample_size: Number(f.get("sample_size")),
          positive_results: Number(f.get("positive_results")),
          assumption: f.get("assumption"),
          result: f.get("result"),
          verdict: f.get("verdict"),
          evidence_url: f.get("evidence_url") || "",
          observed_at: new Date().toISOString(),
        },
      });
      form.reset();
      state.toast(
        "Testutfall sparat. Tidigare analys och modellpoäng är bevarade.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const c = calibration(
    ops.data.feedback.filter((f) => f.opportunity_id === opId),
  );
  return (
    <details className="panel ops-card">
      <summary>Validering och lärande från verkliga utfall</summary>
      <p className="help-note">
        Spara genomförda tester, mätetal och motbevis. Efter minst fem avgörande
        testutfall för samma möjlighet justeras dess prioritering med högst ±10
        poäng. Modellens ursprungliga poäng ändras inte. Egen återkoppling är
        inte oberoende faktaverifiering.
      </p>
      <form className="form-stack" onSubmit={save}>
        <label>
          Affärsmöjlighet
          <select
            value={opId}
            required
            onChange={(e) => setOpId(e.target.value)}
          >
            <option value="" disabled>
              Välj möjlighet
            </option>
            {state.data.opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unik testreferens
          <input
            name="test_reference"
            required
            maxLength={120}
            placeholder="Exempel: pilot-test-2026-10-18"
          />
        </label>
        <div className="ops-form-grid">
          <label>
            Antal testade personer eller försök
            <input
              name="sample_size"
              type="number"
              min="1"
              max="1000000"
              step="1"
              required
            />
          </label>
          <label>
            Antal positiva utfall
            <input
              name="positive_results"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
            />
          </label>
        </div>
        <div className="ops-form-grid">
          <label>
            Testat antagande
            <textarea
              name="assumption"
              required
              minLength={5}
              maxLength={1500}
              rows={3}
            />
          </label>
          <label>
            Uppmätt resultat och metod
            <textarea
              name="result"
              required
              minLength={5}
              maxLength={2000}
              rows={3}
            />
          </label>
        </div>
        <label>
          Slutsats
          <select name="verdict">
            <option value="inconclusive">
              Oklart / otillräckligt underlag
            </option>
            <option value="supported">Antagandet stöds av testet</option>
            <option value="refuted">Antagandet motbevisas av testet</option>
          </select>
        </label>
        <label>
          Källa eller testunderlag (https, valfritt)
          <input name="evidence_url" type="url" />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={!opId || ops.busy}>
          Spara testutfall
        </button>
      </form>
      <p>
        {c.samples} avgörande testutfall · {c.supported} stöder · {c.refuted}{" "}
        motbevisar · prioriteringsjustering {c.adjustment >= 0 ? "+" : ""}
        {c.adjustment}
      </p>
      {ops.data.feedback
        .filter((f) => f.opportunity_id === opId)
        .slice(0, 10)
        .map((f) => (
          <article key={f.id} className="feedback-row">
            <strong>{statusLabels[f.verdict]}</strong>
            <p>{f.assumption}</p>
            <p>{f.result}</p>
            <small>
              {f.test_reference} · {f.positive_results}/{f.sample_size} positiva
              utfall
            </small>
            <small>
              {new Date(f.observed_at).toLocaleString("sv-SE")} · egen
              dokumentation
            </small>
            {f.evidence_url && (
              <a href={f.evidence_url} target="_blank" rel="noreferrer">
                Underlag ↗
              </a>
            )}
          </article>
        ))}
    </details>
  );
}
