"use client";
import { api, type WorkspaceState } from "@/lib/use-workspace";
import { ArrowDownToLine, FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
export default function ResearchFiles({ state }: { state: WorkspaceState }) {
  const [files, setFiles] = useState<{ name: string; id: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    try {
      const r = await api("/api/files");
      setFiles(r.files);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (state.mode === "live") load();
  }, [state.mode]);
  return (
    <section className="panel files-panel">
      <div className="panel-heading">
        <div>
          <h2>Researchbibliotek</h2>
          <p>Privata PDF-, text- och CSV-filer. Max 4 MB per fil.</p>
        </div>
        <label
          className={`button secondary ${state.mode !== "live" ? "disabled" : ""}`}
        >
          <Plus size={15} />
          {busy ? "Laddar upp…" : "Ladda upp"}
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.txt,.csv"
            disabled={state.mode !== "live" || busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setError("");
              try {
                const form = new FormData();
                form.set("file", f);
                const r = await fetch("/api/files", {
                  method: "POST",
                  body: form,
                });
                const b = await r.json();
                if (!r.ok) throw new Error(b.error);
                await load();
                state.toast("Filen är sparad i privat lagring.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {files.length ? (
        <div className="file-list">
          {files.map((f) => (
            <div key={f.id}>
              <FileText size={17} />
              <span>{f.name}</span>
              <button
                className="icon-button"
                aria-label="Öppna fil"
                onClick={async () => {
                  try {
                    const r = await api(
                      `/api/files?name=${encodeURIComponent(f.name)}`,
                    );
                    window.open(r.url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <ArrowDownToLine size={16} />
              </button>
              <button
                className="icon-button danger"
                aria-label="Ta bort fil"
                onClick={async () => {
                  try {
                    await api("/api/files", {
                      method: "DELETE",
                      body: JSON.stringify({ name: f.name }),
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="files-empty">
          {state.mode === "live"
            ? "Inga filer uppladdade."
            : "Logga in med Supabase för att använda privat fillagring."}
        </p>
      )}
      <p className="help-note">
        Filer lagras privat och används inte automatiskt som AI-underlag.
      </p>
    </section>
  );
}
