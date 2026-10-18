"use client";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import {
  Check,
  Cpu,
  Database,
  Loader2,
  LogIn,
  LogOut,
  Pause,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
export default function SettingsPanel({ state }: { state: WorkspaceState }) {
  const [authAction, setAuthAction] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(state.settings.workspace_name);
  const [sectors, setSectors] = useState(state.settings.focus_sectors);
  useEffect(() => {
    setName(state.settings.workspace_name);
    setSectors(state.settings.focus_sectors);
  }, [state.settings]);
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: authAction,
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      if (r.verify)
        state.toast("Kontrollera din e-post för att bekräfta kontot.");
      else {
        await state.reload();
        state.toast("Du är inloggad.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <Users size={19} />
          </div>
          <div>
            <h2>Din arbetsyta</h2>
            <p>Grundinställningar och fokusområden</p>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await state.saveSettings({
                workspace_name: name,
                focus_sectors: sectors,
                currency: "SEK",
              });
            } catch (e) {
              state.toast((e as Error).message);
            }
          }}
        >
          <label>
            Arbetsytans namn
            <input
              value={name}
              required
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Fokusområden
            <input
              value={sectors}
              maxLength={300}
              onChange={(e) => setSectors(e.target.value)}
            />
          </label>
          <label>
            Valuta
            <input readOnly value="SEK — Svensk krona" />
          </label>
          <button
            className="button primary"
            disabled={!["demo", "live"].includes(state.mode)}
          >
            <Check size={15} />
            Spara inställningar
          </button>
        </form>
      </section>
      <section className="panel settings-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <ShieldCheck size={19} />
          </div>
          <div>
            <h2>Konto & säkerhet</h2>
            <p>Supabase Auth med privata arbetsytor</p>
          </div>
        </div>
        {state.mode === "live" ? (
          <div className="account-connected">
            <div className="connected-check">
              <Check size={22} />
            </div>
            <strong>Inloggad som {state.email}</strong>
            <p>Databas och filer isoleras med Row Level Security.</p>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api("/api/auth", {
                    method: "POST",
                    body: JSON.stringify({ action: "logout" }),
                  });
                  location.assign("/settings");
                } catch (e) {
                  state.toast((e as Error).message);
                }
              }}
            >
              <LogOut size={15} />
              Logga ut
            </button>
          </div>
        ) : state.config.supabase ? (
          <>
            <div className="tabs auth-tabs">
              <button
                className={authAction === "login" ? "active" : ""}
                onClick={() => setAuthAction("login")}
              >
                Logga in
              </button>
              <button
                className={authAction === "signup" ? "active" : ""}
                onClick={() => setAuthAction("signup")}
              >
                Skapa konto
              </button>
            </div>
            <form onSubmit={auth} className="form-stack">
              <label>
                E-post
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Lösenord
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete={
                    authAction === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Minst 12 tecken"
                  required
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <LogIn size={15} />
                )}{" "}
                {authAction === "login" ? "Logga in" : "Skapa konto"}
              </button>
            </form>
          </>
        ) : (
          <div className="config-callout">
            <Database size={19} />
            <p>
              Autentisering blir tillgänglig när Supabase är konfigurerat. Följ
              stegen nedan.
            </p>
          </div>
        )}
      </section>
      <section className="panel settings-card integrations-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <Zap size={19} />
          </div>
          <div>
            <h2>Integrationer</h2>
            <p>Nycklar läses enbart från serverns miljövariabler</p>
          </div>
        </div>
        {[
          {
            name: "Supabase",
            sub: "Databas, autentisering & privat fillagring",
            ready: state.config.supabase,
            icon: Database,
          },
          {
            name: "OpenAI",
            sub: `Agents SDK · ${state.config.model}`,
            ready: state.config.openai,
            icon: Sparkles,
          },
        ].map((i) => (
          <div className="integration-row" key={i.name}>
            <div className="integration-logo">
              <i.icon size={22} />
            </div>
            <div>
              <strong>{i.name}</strong>
              <span>{i.sub}</span>
            </div>
            <span className={`integration-status ${i.ready ? "ready" : ""}`}>
              <span />
              {i.ready ? "Konfigurerad" : "Ej konfigurerad"}
            </span>
          </div>
        ))}
        <div className="setup-instructions">
          <h3>Kom igång med riktig data</h3>
          <ol>
            <li>
              Skapa ett Supabase-projekt och kör{" "}
              <code>supabase/migrations/001_foundation.sql</code> följt av{" "}
              <code>002_hardening.sql</code> och{" "}
              <code>003_ai_workflows.sql</code> och{" "}
              <code>20261017230742_analysis_pipeline.sql</code> i SQL Editor.
            </li>
            <li>
              Kopiera <code>.env.example</code> till <code>.env.local</code> och
              ange projektets URL och publishable key.
            </li>
            <li>
              Lägg till <code>OPENAI_API_KEY</code> på servern. Lägg aldrig
              hemliga nycklar i klientkod eller i chatten.
            </li>
            <li>
              Sätt <code>APP_URL</code> till appens exakta adress och lägg till{" "}
              <code>/auth/callback</code> som tillåten redirect i Supabase.
            </li>
            <li>
              Starta om servern. Skapa konto, bekräfta din e-post och logga in.
            </li>
          </ol>
          <div className="env-list">
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
            <code>OPENAI_API_KEY</code>
            <code>APP_URL</code>
          </div>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-heading">
          <div className="settings-icon">
            <Cpu size={19} />
          </div>
          <div>
            <h2>Automatisering & kontroll</h2>
            <p>Avgränsade uppdrag med spårbar historik</p>
          </div>
        </div>
        <div className="policy-list">
          <div>
            <Check size={16} />
            <span>
              Jarvis samordnar Scout, Research, Validator, Strategist, Finance
              och Critic. Sales är valfri.
            </span>
          </div>
          <div>
            <Check size={16} />
            <span>
              Kompletta analyser: budgettak $1.20–$2.00, reserverad kostnad före
              varje anrop och sparade delresultat.
            </span>
          </div>
          <div>
            <Check size={16} />
            <span>Analysflöden startas manuellt med ett tydligt uppdrag.</span>
          </div>
          <div>
            <Check size={16} />
            <span>Research kan söka på webben och spara källor.</span>
          </div>
          <div>
            <Check size={16} />
            <span>
              Max 10 starter, återupptagningar eller chattfrågor per konto och
              timme.
            </span>
          </div>
          <div>
            <Check size={16} />
            <span>Inga automatiska utskick, köp eller investeringar.</span>
          </div>
          <div>
            <Pause size={16} />
            <span>Schemalagda körningar är inte aktiverade.</span>
          </div>
        </div>
        <p className="help-note">
          AI-anrop skickar ditt uppdrag och avgränsad arbetsytedata till OpenAI.
          Egna enstaka agenter har en riktbudget. Det nya Jarvis-flödet
          reserverar hela kostnadsramen före varje steg och stannar om budgeten
          inte räcker. Säkerhetsinställningar ändras inte från gränssnittet.
        </p>
      </section>
      {state.mode === "demo" && (
        <section className="panel settings-card">
          <div className="settings-heading">
            <div className="settings-icon">
              <Database size={19} />
            </div>
            <div>
              <h2>Demodata</h2>
              <p>Endast i denna webbläsare</p>
            </div>
          </div>
          <p className="modal-description">
            Återställ exempelposter och alla lokala demoändringar till
            ursprungsläget.
          </p>
          <ResetDemo state={state} />
        </section>
      )}
    </div>
  );
}
function ResetDemo({ state }: { state: WorkspaceState }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="reset-confirm">
      <p>Alla dina lokala demoändringar raderas.</p>
      <button
        className="button danger-button small"
        onClick={() => {
          state.resetDemo();
          setConfirm(false);
        }}
      >
        Återställ nu
      </button>
      <button
        className="button secondary small"
        onClick={() => setConfirm(false)}
      >
        Avbryt
      </button>
    </div>
  ) : (
    <button className="button secondary" onClick={() => setConfirm(true)}>
      Återställ demodata
    </button>
  );
}
