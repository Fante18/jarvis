"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { WorkspaceState } from "@/lib/use-workspace";
import { api } from "@/lib/use-workspace";
import { useOperations } from "@/lib/use-operations";
import {
  controlsSchema,
  scheduleSchema,
  type Controls,
  type Schedule,
} from "@/lib/automation";
import { usd } from "@/lib/analysis/contracts";
import {
  CalendarClock,
  Pause,
  Plus,
  ShieldCheck,
  Mail,
  Trash2,
} from "lucide-react";
import { OperationsNotice } from "./overview";
export default function AutomationSettings({
  state,
}: {
  state: WorkspaceState;
}) {
  const ops = useOperations(state, false),
    [controls, setControls] = useState<Controls>(ops.data.controls),
    [edit, setEdit] = useState<Schedule | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("gmail");
    if (result === "connected")
      state.toast("Gmail anslutet. Inget meddelande har skickats.");
    if (result === "error")
      setError(
        "Gmail kunde inte anslutas. Kontrollera OAuth-inställningar, testanvändare och sändbehörighet enligt driftguiden.",
      );
  }, [state.toast]);
  const { enabled, daily_limit_cents, monthly_limit_cents } = ops.data.controls;
  useEffect(
    () => setControls({ enabled, daily_limit_cents, monthly_limit_cents }),
    [enabled, daily_limit_cents, monthly_limit_cents],
  );
  async function guard(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      state.toast("Sparat.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form);
    await guard(async () => {
      const input = scheduleSchema.parse({
        name: fd.get("name"),
        topic: fd.get("topic"),
        interval_days: Number(fd.get("interval_days")),
        budget_cents: Math.round(Number(fd.get("budget")) * 100),
        enabled: fd.get("enabled") === "on",
      });
      await ops.act("/api/automation", {
        action: "schedule",
        schedule: input,
        id: edit?.id,
      });
      setEdit(null);
      form.reset();
    });
  }
  return (
    <>
      <section className="panel settings-card integrations-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <CalendarClock size={20} />
          </div>
          <div>
            <h2>Marknadsskanningar & budget</h2>
            <p>
              Daglig schemaläggare · alla AI-funktioner delar kostnadsgränser
            </p>
          </div>
        </div>
        {!ops.live ? (
          <p>
            Logga in med en riktig arbetsyta för att skapa scheman. Demoläget
            startar inga bakgrundskörningar.
          </p>
        ) : (
          <>
            <OperationsNotice ops={ops} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!ops.data.worker_configured && (
              <div className="config-callout">
                <ShieldCheck size={20} />
                <p>
                  Bakgrundskörningar kräver <code>SUPABASE_SECRET_KEY</code> och{" "}
                  <code>CRON_SECRET</code> på servern. Du kan förbereda scheman
                  nu. Aktivering blir tillgänglig efter konfiguration och
                  ompublicering. Se{" "}
                  <a
                    href="https://github.com/Fante18/jarvis/blob/main/docs/PHASE3.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    driftguiden ↗
                  </a>
                  .
                </p>
              </div>
            )}
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void guard(() =>
                  ops.act("/api/automation", {
                    action: "controls",
                    controls: controlsSchema.parse(controls),
                  }),
                );
              }}
            >
              <div className="ops-form-grid">
                <label>
                  Dagsbudget för AI (USD)
                  <input
                    type="number"
                    step="0.01"
                    min="1.20"
                    max="100"
                    required
                    value={controls.daily_limit_cents / 100}
                    onChange={(e) =>
                      setControls({
                        ...controls,
                        daily_limit_cents: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Månadsbudget för AI (USD)
                  <input
                    type="number"
                    step="0.01"
                    min="1.20"
                    max="1000"
                    required
                    value={controls.monthly_limit_cents / 100}
                    onChange={(e) =>
                      setControls({
                        ...controls,
                        monthly_limit_cents: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={controls.enabled}
                  disabled={!ops.data.worker_configured}
                  onChange={(e) =>
                    setControls({ ...controls, enabled: e.target.checked })
                  }
                />{" "}
                Tillåt schemalagda analyser inom budgeten
              </label>
              <p className="help-note">
                Idag: {usd(ops.data.daily_microusd)} · månad:{" "}
                {usd(ops.data.monthly_microusd)} beräknat och reserverat.
                Perioder följer UTC. Osäkra reservationer räknas även över
                periodskiften. OpenAI-fakturan är slutligt kostnadsunderlag.
              </p>
              <div className="ops-actions">
                <button className="button primary" disabled={ops.busy}>
                  Spara budget och automatisering
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={ops.busy || !ops.data.controls.enabled}
                  onClick={() =>
                    void guard(() =>
                      ops.act("/api/automation", {
                        action: "controls",
                        controls: { ...ops.data.controls, enabled: false },
                      }),
                    )
                  }
                >
                  <Pause size={15} /> Pausa all automatisering
                </button>
              </div>
            </form>
            <div className="ops-divider" />
            <h3>Dina skanningsscheman</h3>
            <p className="help-note">
              Schemaläggaren kontrollerar scheman dagligen cirka 06 UTC. Högst
              tre scheman körs per tillfälle och ett uppdrag per arbetsyta
              samtidigt. Ett nytt schema kan köras vid nästa kontroll. Veckovisa
              scheman väntar minst sju dygn mellan körningarna.
            </p>
            {ops.data.schedules.map((s) => (
              <article className="schedule-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>{s.topic}</p>
                  <small>
                    {s.enabled ? "Aktivt schema" : "Pausat schema"} ·{" "}
                    {s.interval_days === 1 ? "Dagligen" : "Varje vecka"} · tak $
                    {(s.budget_cents / 100).toFixed(2)} · tidigast{" "}
                    {new Date(s.next_run_at).toLocaleString("sv-SE")}
                  </small>
                  {s.last_error && <p className="form-error">{s.last_error}</p>}
                </div>
                <div className="ops-actions">
                  <button
                    className="button secondary small"
                    onClick={() => setEdit(s)}
                  >
                    Redigera schema
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Ta bort schema ${s.name}`}
                    onClick={() => {
                      if (confirm("Ta bort schemat? Analyshistoriken bevaras."))
                        void guard(() =>
                          ops.act("/api/automation", {
                            action: "delete_schedule",
                            id: s.id,
                          }),
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            <form
              key={edit?.id || "new"}
              className="form-stack"
              onSubmit={schedule}
            >
              <h3>{edit ? "Redigera skanning" : "Nytt skanningsschema"}</h3>
              <label>
                Namn på skanningen
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={edit?.name}
                />
              </label>
              <label>
                Offentligt sökområde
                <textarea
                  name="topic"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  defaultValue={edit?.topic}
                />
              </label>
              <p className="help-note">
                Sökområdet används i offentliga webbsökningar. Lägg inga
                personuppgifter eller hemligheter här.
              </p>
              <div className="ops-form-grid">
                <label>
                  Frekvens
                  <select
                    name="interval_days"
                    defaultValue={edit?.interval_days || 1}
                  >
                    <option value="1">Dagligen</option>
                    <option value="7">Varje vecka</option>
                  </select>
                </label>
                <label>
                  Budget per analys (USD)
                  <input
                    name="budget"
                    type="number"
                    step="0.01"
                    min="1.20"
                    max="2"
                    required
                    defaultValue={(edit?.budget_cents || 150) / 100}
                  />
                </label>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={edit?.enabled || false}
                />{" "}
                Aktivera schemat när central automatisering är på
              </label>
              <div className="ops-actions">
                <button className="button primary" disabled={ops.busy}>
                  <Plus size={15} />
                  {edit ? "Spara schema" : "Skapa schema"}
                </button>
                {edit && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setEdit(null)}
                  >
                    Avbryt redigering
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </section>
      <section className="panel settings-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <Mail size={19} />
          </div>
          <div>
            <h2>Gmail via säker OAuth</h2>
            <p>Endast sändbehörighet · inga inkorgsmeddelanden läses</p>
          </div>
        </div>
        {ops.data.gmail.email ? (
          <>
            <p>
              Anslutet konto: <strong>{ops.data.gmail.email}</strong>
            </p>
            <button
              className="button secondary"
              disabled={ops.busy}
              onClick={() =>
                void guard(async () => {
                  await api("/api/integrations/gmail", { method: "DELETE" });
                  await ops.refresh();
                })
              }
            >
              Koppla från Gmail
            </button>
          </>
        ) : (
          <button
            className="button primary"
            disabled={!ops.live || !ops.data.gmail.configured}
            onClick={() =>
              void guard(async () => {
                const r = await api("/api/integrations/gmail/start", {
                  method: "POST",
                });
                location.assign(r.url);
              })
            }
          >
            Anslut Gmail
          </button>
        )}
        {!ops.data.gmail.configured && (
          <p className="help-note">
            Behöver GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, EMAIL_ENCRYPTION_KEY
            och SUPABASE_SECRET_KEY i Vercel.{" "}
            <a
              href="https://github.com/Fante18/jarvis/blob/main/docs/PHASE3.md"
              target="_blank"
              rel="noreferrer"
            >
              Exakta OAuth-instruktioner ↗
            </a>
            . Säljutkast och godkännanden fungerar utan mejlanslutning.
          </p>
        )}
        <p className="help-note">
          Endast uttryckligen godkända meddelanden kan skickas genom ett separat
          klick. Dokumentera samtycke på leaden och respektera invändningar. Du
          ansvarar för att kontakten är tillåten enligt gällande regler.
        </p>
      </section>
      {ops.live && (
        <section className="panel settings-card">
          <h2>Audit-logg</h2>
          <p className="help-note">
            Oföränderliga händelser med minimala metadata. Meddelandetext och
            nycklar lagras inte i audit-loggen.
          </p>
          <div className="audit-list">
            {ops.data.audit.map((a) => (
              <p key={a.id}>
                <time>{new Date(a.created_at).toLocaleString("sv-SE")}</time> ·{" "}
                {a.entity} · {a.action}
              </p>
            ))}
            {!ops.data.audit.length && <p>Inga händelser ännu.</p>}
          </div>
        </section>
      )}
    </>
  );
}
