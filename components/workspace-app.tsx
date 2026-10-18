"use client";
import {
  metrics,
  money,
  safeSourceUrl,
  type Agent,
  type Entity,
  type Opportunity,
  type Section,
} from "@/lib/domain";
import { useWorkspace } from "@/lib/use-workspace";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ActivityList from "./activity-list";
import Editor from "./record-editor";
import RunDialog from "./run-dialog";
import { Badge, Empty, Modal } from "./ui";
import AgentsView from "./views/agents";
import ApprovalsView from "./views/approvals";
import Chat from "./views/chat";
import DashboardView from "./views/dashboard";
import IntelligenceView from "./views/intelligence";
import OpportunitiesView from "./views/opportunities";
import SalesView from "./views/sales";
import SettingsPanel from "./views/settings";
const navigation = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents", label: "AI Agents", icon: Bot },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "intelligence", label: "Market Intelligence", icon: Globe },
  { id: "sales", label: "Sales", icon: BarChart3 },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "chat", label: "Ask Jarvis", icon: MessageSquare },
] as const;
const titles: Record<Section, string> = {
  dashboard: "Dashboard",
  agents: "AI Agents",
  opportunities: "Opportunities",
  intelligence: "Market Intelligence",
  sales: "Sales",
  approvals: "Approvals",
  chat: "Ask Jarvis",
  settings: "Settings",
};
export default function WorkspaceApp({ section }: { section: Section }) {
  const state = useWorkspace();
  const { data, mode } = state;
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [editor, setEditor] = useState<{
    entity: Entity;
    record?: Record<string, unknown>;
  } | null>(null);
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [runPrompt, setRunPrompt] = useState("");
  const [runAgent, setRunAgent] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    entity: Entity;
    id: string;
  } | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const openEditor = (entity: Entity, record?: object) =>
    setEditor({ entity, record: record as Record<string, unknown> });
  useEffect(() => {
    setFilter("all");
    setQuery("");
  }, [section]);
  const stats = metrics(data);
  const pending = data.approvals.filter((a) => a.status === "pending").length;
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), mode, data },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    state.toast("Arbetsytan har exporterats.");
  }
  const guardError = (fn: () => Promise<unknown>) =>
    fn().catch((e) => state.toast((e as Error).message));
  const results = [
    ...data.opportunities.map((r) => ({
      label: r.title,
      sub: "Opportunity",
      href: "/opportunities",
    })),
    ...data.agents.map((r) => ({
      label: r.name,
      sub: "Agent",
      href: "/agents",
    })),
    ...data.leads.map((r) => ({
      label: `${r.company} · ${r.name}`,
      sub: "Lead",
      href: "/sales",
    })),
    ...data.signals.map((r) => ({
      label: r.title,
      sub: "Marknadssignal",
      href: "/intelligence",
    })),
  ].filter((r) =>
    r.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const viewProps = {
    state,
    stats,
    filter,
    setFilter,
    query,
    setQuery,
    days,
    setDays,
    openEditor,
    setDetail,
    setRunAgent,
    setDeleteTarget,
    setActivityOpen,
    guardError,
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand">
          <div className="brand-symbol">
            <span />
            <span />
            <span />
          </div>
          <span>
            JARVIS<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-picker">
          <div className="workspace-avatar">W</div>
          <div>
            <strong>{state.settings.workspace_name}</strong>
            <span>
              {mode === "live" ? "Personlig arbetsyta" : "Demo workspace"}
            </span>
          </div>
          <Link href="/settings" aria-label="Arbetsytans inställningar">
            <ChevronDown size={15} />
          </Link>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((n) => (
            <Link
              onClick={() => setMobile(false)}
              href={n.id === "dashboard" ? "/" : `/${n.id}`}
              key={n.id}
              className={`nav-item ${section === n.id ? "selected" : ""}`}
              aria-current={section === n.id ? "page" : undefined}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "approvals" && pending > 0 && <b>{pending}</b>}
              {n.id === "chat" && <Sparkles size={13} className="nav-spark" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-heading">
              <span className="status-dot" />
              {mode === "live" ? "Arbetsytan är ansluten" : "Demo workspace"}
              <Activity size={14} />
            </div>
            <p>
              {mode === "live"
                ? `${stats.activeAgents} agenter redo för uppdrag`
                : "Utforska vad JARVIS kan göra."}
            </p>
            <Link href="/settings">
              {mode === "live" ? "Visa integrationer" : "Anslut din arbetsyta"}
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <Link
            href="/settings"
            className={`nav-item ${section === "settings" ? "selected" : ""}`}
          >
            <Settings2 size={18} />
            <span>Settings</span>
          </Link>
          <div className="profile">
            <div className="profile-avatar">
              {state.email ? state.email[0].toUpperCase() : "A"}
            </div>
            <div>
              <strong>
                {state.email ? state.email.split("@")[0] : "Alex Morgan"}
              </strong>
              <span>{mode === "live" ? "Personligt konto" : "Demo-konto"}</span>
            </div>
            <Link href="/settings" aria-label="Kontoinställningar">
              <MoreHorizontal size={19} />
            </Link>
          </div>
        </div>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobile(false)}
          aria-label="Stäng meny"
        >
          <X />
        </button>
      </aside>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Öppna meny"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{titles[section]}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="Sök i arbetsytan"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Sök i arbetsytan...</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <span
              className={`connection ${mode === "demo" ? "demo-connection" : ""}`}
            >
              <span />
              {mode === "live"
                ? "Ansluten"
                : mode === "loading"
                  ? "Ansluter"
                  : "Demoläge"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Visa aktivitet"
              onClick={() => setActivityOpen(true)}
            >
              <Bell size={18} />
              {pending > 0 && <i />}
            </button>
            <Link
              href="/settings"
              className="top-avatar"
              aria-label="Ditt konto"
            >
              {state.email ? state.email[0].toUpperCase() : "A"}
            </Link>
          </div>
        </header>
        <main className={`content content-${section}`}>
          <div className="page-heading">
            <div className="page-eyebrow">
              <span /> INTELLIGENCE INTO OPPORTUNITY
            </div>
            <div className="page-title-row">
              <div>
                <h1>
                  {titles[section]}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {
                    {
                      dashboard: "Ditt nästa steg börjar med rätt insikt.",
                      agents: "Ditt team av specialiserade AI-agenter.",
                      opportunities:
                        "Från tidiga signaler till validerade affärsidéer.",
                      intelligence: "Se förändringen innan den blir självklar.",
                      sales:
                        "En tydlig väg från första kontakt till vunnen affär.",
                      approvals: "Du har kontrollen över nästa steg.",
                      chat: "Tänk större. Låt Jarvis hjälpa dig framåt.",
                      settings:
                        "Anslut, konfigurera och gör arbetsytan till din.",
                    }[section]
                  }
                </p>
              </div>
              <div className="page-actions">
                {section === "dashboard" ? (
                  <>
                    <button
                      className="button secondary export-button"
                      onClick={exportData}
                    >
                      <ArrowDownToLine size={15} />
                      Exportera
                    </button>
                    <Link className="button primary" href="/chat?analysis=1">
                      <Sparkles size={16} />
                      Starta analys
                    </Link>
                  </>
                ) : (
                  [
                    "agents",
                    "opportunities",
                    "intelligence",
                    "sales",
                    "approvals",
                  ].includes(section) && (
                    <button
                      className="button primary"
                      onClick={() =>
                        openEditor(
                          (
                            {
                              agents: "agents",
                              opportunities: "opportunities",
                              intelligence: "signals",
                              sales: "leads",
                              approvals: "approvals",
                            } as Record<string, Entity>
                          )[section],
                        )
                      }
                    >
                      <Plus size={17} />
                      {
                        (
                          {
                            agents: "Skapa agent",
                            opportunities: "Ny möjlighet",
                            intelligence: "Lägg till signal",
                            sales: "Ny lead",
                            approvals: "Nytt förslag",
                          } as Record<string, string>
                        )[section]
                      }
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          {mode === "demo" && (
            <div className="demo-banner">
              <span>
                <Database size={14} />
                <strong>Demoläge</strong>
                <span>
                  Exempeldata · ändringar sparas i den här webbläsaren. Inga
                  AI-agenter körs.
                </span>
              </span>
              <Link href="/settings">
                Konfigurera JARVIS
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
          {mode === "login" && (
            <div className="login-banner">
              <LogIn size={18} />
              <div>
                <strong>Logga in för att öppna din arbetsyta</strong>
                <p>Din data är privat och kräver autentisering.</p>
              </div>
              <Link href="/settings" className="button primary">
                Till inloggning
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {section === "dashboard" && <DashboardView {...viewProps} />}
          {section === "agents" && <AgentsView {...viewProps} />}
          {section === "opportunities" && <OpportunitiesView {...viewProps} />}
          {section === "intelligence" && <IntelligenceView {...viewProps} />}
          {section === "sales" && <SalesView {...viewProps} />}
          {section === "approvals" && <ApprovalsView {...viewProps} />}
          {section === "chat" && (
            <Chat
              state={state}
              onRun={(agent, prompt) => {
                setRunPrompt(prompt);
                setRunAgent(agent);
              }}
            />
          )}
          {section === "settings" && <SettingsPanel state={state} />}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} JARVIS</span>
          <span>
            Built for what comes next.
            <span className="tiny-dot" />
            INTELLIGENCE, WITH INTENTION.
          </span>
        </footer>
      </div>
      {state.notice && (
        <div role="status" className="toast">
          <span>{state.notice}</span>
          <button
            aria-label="Stäng meddelande"
            className="icon-button"
            onClick={() => state.toast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {editor && (
        <Editor {...editor} state={state} onClose={() => setEditor(null)} />
      )}
      {detail && (
        <Modal title="Affärsmöjlighet" onClose={() => setDetail(null)} wide>
          <div className="detail">
            <div>
              <Badge value={detail.status} />
              <span className="sector-label">{detail.sector}</span>
            </div>
            <h3>{detail.title}</h3>
            <div className="detail-stats">
              <div>
                <span>Bedömd potential</span>
                <strong>
                  {detail.score}
                  <small>/100</small>
                </strong>
              </div>
              <div>
                <span>Uppskattat värde</span>
                <strong>{money(detail.value)}</strong>
              </div>
            </div>
            <h4>Analys & nästa steg</h4>
            <p>{detail.description}</p>
            {detail.origin_analysis_id && (
              <Link
                className="button secondary"
                href={`/chat?analysis_id=${detail.origin_analysis_id}`}
                onClick={() => setDetail(null)}
              >
                Öppna hela Jarvis-analysen
                <ArrowRight size={14} />
              </Link>
            )}
            {safeSourceUrl(detail.source_url) && (
              <a
                className="text-link"
                href={safeSourceUrl(detail.source_url)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Granska originalkälla
                <ExternalLink size={14} />
              </a>
            )}
            <p className="help-note">
              {mode === "demo"
                ? "Detta är en illustrativ affärsidé med demodata."
                : "AI-genererade analyser och uppskattningar behöver verifieras."}
            </p>
            <div className="modal-actions">
              <button
                className="button secondary danger"
                onClick={() => {
                  setDeleteTarget({ entity: "opportunities", id: detail.id });
                  setDetail(null);
                }}
              >
                <Trash2 size={15} />
                Ta bort
              </button>
              <button
                className="button primary"
                onClick={() => {
                  openEditor("opportunities", detail);
                  setDetail(null);
                }}
              >
                Redigera möjlighet
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {runAgent && (
        <RunDialog
          agent={runAgent}
          initialPrompt={runPrompt}
          state={state}
          onClose={() => {
            setRunAgent(null);
            setRunPrompt("");
          }}
        />
      )}
      {deleteTarget && (
        <Modal title="Ta bort posten?" onClose={() => setDeleteTarget(null)}>
          <p className="modal-description">
            Posten tas bort från{" "}
            {mode === "demo" ? "din lokala demo" : "din arbetsyta"}. Åtgärden
            kan inte ångras. Körhistorik och aktivitetslogg bevaras.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Avbryt
            </button>
            <button
              className="button danger-button"
              disabled={state.busy}
              onClick={() =>
                guardError(async () => {
                  await state.remove(deleteTarget.entity, deleteTarget.id);
                  setDeleteTarget(null);
                })
              }
            >
              <Trash2 size={15} />
              Ta bort
            </button>
          </div>
        </Modal>
      )}
      {searchOpen && (
        <Modal title="Sök i arbetsytan" onClose={() => setSearchOpen(false)}>
          <div className="input-search search-modal-input">
            <Search size={18} />
            <input
              autoFocus
              placeholder="Möjligheter, agenter, leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="search-results">
            {results.slice(0, 15).map((r, i) => (
              <Link
                onClick={() => setSearchOpen(false)}
                href={r.href}
                key={`${r.label}-${i}`}
              >
                <span>
                  <strong>{r.label}</strong>
                  <small>{r.sub}</small>
                </span>
                <ArrowUpRight size={15} />
              </Link>
            ))}
            {!results.length && (
              <Empty text="Inga resultat. Prova ett annat sökord." />
            )}
          </div>
        </Modal>
      )}
      {activityOpen && (
        <Modal title="Aktivitetslogg" onClose={() => setActivityOpen(false)}>
          <ActivityList state={state} limit={100} />
        </Modal>
      )}
    </div>
  );
}
