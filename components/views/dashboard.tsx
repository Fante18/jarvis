"use client";
import OperationsOverview from "../operations/overview";
import { money } from "@/lib/domain";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Cpu,
  Lightbulb,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import ActivityList from "../activity-list";
import { RevenueChart, Sparkline } from "../charts";
import { Empty, Orb, statusLabels } from "../ui";
import type { ViewProps } from "../view-props";
export default function DashboardView({
  state,
  stats,
  filter,
  days,
  setDays,
  setDetail,
  setRunAgent,
  setActivityOpen,
}: ViewProps) {
  const { data, mode } = state;
  return (
    <>
      <OperationsOverview state={state} />
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="eyebrow">
            <Sparkles size={13} /> YOUR BUSINESS, SUPERCHARGED
          </span>
          <h2>
            Stora möjligheter.
            <br />
            <em>Ett steg före.</em>
          </h2>
          <p>
            Upptäck det som kommer härnäst. Dina agenter
            <br className="desktop-break" /> kopplar samman signalerna, du
            väljer riktningen.
          </p>
          <Link href="/opportunities" className="welcome-link">
            Utforska möjligheter
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="orb-scene">
          <div className="orb-grid" />
          <span className="orbit-tag orbit-tag-top">
            <Radio size={12} />
            MARKET INTELLIGENCE
          </span>
          <Orb />
          <span className="orbit-tag orbit-tag-bottom">
            <span className="status-dot" />
            {mode === "live" ? "READY FOR YOUR NEXT MOVE" : "DEMO PREVIEW"}
          </span>
          <span className="orb-coordinate">J.A.R.V.I.S / CORE 01</span>
        </div>
        <div className="welcome-corner">
          POWERED BY INTELLIGENCE <span>↗</span>
        </div>
      </section>
      <div className="stats-grid">
        {[
          {
            label: "Vunnet affärsvärde",
            value: money(stats.revenue),
            icon: Wallet,
            foot: "Summa vunna leads",
            accent: "mint",
          },
          {
            label: "Affärsmöjligheter",
            value: String(stats.opportunities).padStart(2, "0"),
            icon: Lightbulb,
            foot: `${data.opportunities.filter((o) => o.score >= 85).length} med potential ≥85`,
            accent: "blue",
          },
          {
            label: "Egna agenter redo",
            value: `${stats.activeAgents.toString().padStart(2, "0")} / ${data.agents.length.toString().padStart(2, "0")}`,
            icon: Bot,
            foot: `${data.agent_runs.filter((r) => r.status === "running").length} körningar pågår`,
            accent: "purple",
          },
          {
            label: "Pipeline-värde",
            value: money(stats.pipeline),
            icon: TrendingUp,
            foot: `${data.leads.filter((l) => !["won", "lost"].includes(l.stage)).length} öppna affärer`,
            accent: "mint",
          },
        ].map((s, i) => (
          <div className={`stat-card stat-${s.accent}`} key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <div className="stat-icon">
                <s.icon size={16} />
              </div>
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-bottom">
              <span>
                <span className="tiny-dot" />
                {s.foot}
              </span>
              {mode === "demo" && <Sparkline variant={i} />}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Affärsutveckling<span className="subtle-badge">SEK</span>
              </h2>
              <p>Ackumulerat värde av vunna leads</p>
            </div>
            <select
              aria-label="Period för affärsutveckling"
              className="small-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Senaste 7 dagarna</option>
              <option value={30}>Senaste 30 dagarna</option>
              <option value={90}>Senaste 90 dagarna</option>
            </select>
          </div>
          <div className="chart-summary">
            <strong>
              {money(
                data.leads
                  .filter(
                    (l) =>
                      l.stage === "won" &&
                      Date.parse(l.created_at) >= Date.now() - days * 86400000,
                  )
                  .reduce((s, l) => s + l.value, 0),
              )}
            </strong>
            <span>
              <span className="legend-dot" />
              Vunnet affärsvärde
            </span>
          </div>
          <RevenueChart leads={data.leads} days={days} />
          <p className="chart-note">
            Baserat på när vunna leads skapades.{" "}
            {mode === "demo" ? "Illustrativa exempelvärden." : ""}
          </p>
        </section>
        <section className="panel agent-panel">
          <div className="panel-heading">
            <div>
              <h2>Dina AI-agenter</h2>
              <p>Ett team med fokus på tillväxt</p>
            </div>
            <Link href="/agents" className="text-link">
              Visa alla
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="agent-mini-list">
            {data.agents.slice(0, 3).map((a, i) => (
              <div className="agent-mini" key={a.id}>
                <div className={`agent-icon agent-color-${i}`}>
                  <Bot size={19} />
                </div>
                <div>
                  <strong>{a.name}</strong>
                  <span>
                    {a.kind === "research"
                      ? "Marknadsbevakning"
                      : a.kind === "sales"
                        ? "Försäljningsstrategi"
                        : "Affärsanalys"}
                  </span>
                </div>
                <span
                  className={`mini-status ${a.status === "paused" ? "paused" : ""}`}
                  title={statusLabels[a.status]}
                />
                <button
                  className="icon-button"
                  onClick={() => setRunAgent(a)}
                  aria-label={`Öppna ${a.name}`}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            ))}
          </div>
          {!data.agents.length && <Empty text="Skapa din första agent." />}
          <div className="agent-panel-footer">
            <span>
              <Cpu size={14} />
              {
                data.agent_runs.filter((r) => r.status === "completed").length
              }{" "}
              slutförda körningar
            </span>
            <Link href="/agents">
              <Plus size={14} />
              Skapa agent
            </Link>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel opportunities-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Utvalda möjligheter
                <span className="count-badge">{stats.opportunities}</span>
              </h2>
              <p>Högst bedömd potential i din arbetsyta</p>
            </div>
            <Link href="/opportunities" className="text-link">
              Visa alla
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AFFÄRSMÖJLIGHET</th>
                  <th>POTENTIAL</th>
                  <th>VÄRDE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...data.opportunities]
                  .filter((o) => o.status !== "archived")
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((o, i) => (
                    <tr key={o.id}>
                      <td>
                        <button
                          className="opportunity-table-title"
                          onClick={() => setDetail(o)}
                        >
                          <span className={`opportunity-icon opportunity-${i}`}>
                            <Lightbulb size={17} />
                          </span>
                          <span>
                            <strong>{o.title}</strong>
                            <small>{o.sector}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="score">
                          <span />
                          {o.score}
                          <small>/100</small>
                        </span>
                      </td>
                      <td className="table-value">{money(o.value, true)}</td>
                      <td>
                        <button
                          className="icon-button"
                          onClick={() => setDetail(o)}
                          aria-label={`Visa ${o.title}`}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data.opportunities.length && (
            <Empty text="Dina möjligheter visas här." />
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Senaste aktivitet</h2>
              <p>Det händer i din arbetsyta</p>
            </div>
            <span className="live-indicator">
              <span />
              {mode === "demo" ? "DEMO" : "LOGG"}
            </span>
          </div>
          <ActivityList state={state} limit={4} />
          <button
            className="activity-footer"
            onClick={() => setActivityOpen(true)}
          >
            Visa all aktivitet
            <ArrowRight size={13} />
          </button>
        </section>
      </div>
      <div className="dashboard-footnote">
        <span>
          <ShieldCheck size={13} />
          Du bestämmer. Jarvis förbereder.
        </span>
        <span>JARVIS SYSTEM / V 1.0</span>
      </div>
    </>
  );
}
