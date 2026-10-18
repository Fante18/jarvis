"use client";
import { useCallback, useEffect, useState } from "react";
import { demoWorkspace } from "./demo";
import {
  defaultSettings,
  emptyWorkspace,
  type Entity,
  type Settings,
  type Workspace,
} from "./domain";
const KEY = "jarvis.demo.v1";
export async function api(path: string, options: RequestInit = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Begäran misslyckades.");
  return body;
}
export function useWorkspace() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [mode, setMode] = useState<"loading" | "demo" | "live" | "login">(
    "loading",
  );
  const [config, setConfig] = useState({
    supabase: false,
    openai: false,
    model: "gpt-4.1-mini",
  });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useCallback((s: string) => setNotice(s), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  const reload = useCallback(async () => {
    const r = await api("/api/workspace");
    setData(r.data);
    setEmail(r.user.email);
    setSettings(r.settings);
    setMode("live");
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await api("/api/config");
        if (!mounted) return;
        setConfig(c);
        if (c.supabase) {
          try {
            await reload();
          } catch (e) {
            setData(emptyWorkspace());
            setMode("login");
            toast((e as Error).message);
          }
        } else {
          setData(demoWorkspace());
          try {
            const stored = localStorage.getItem(KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              if (
                !parsed.data ||
                !Array.isArray(parsed.data.agents) ||
                !Array.isArray(parsed.data.opportunities)
              )
                throw new Error();
              setData({ ...emptyWorkspace(), ...parsed.data });
              setSettings({ ...defaultSettings, ...parsed.settings });
            }
          } catch {
            toast("Sparad demo kunde inte läsas. En ny demo visas.");
          }
          setMode("demo");
        }
      } catch {
        if (mounted) {
          setData(emptyWorkspace());
          setMode("login");
          toast("Kunde inte läsa serverkonfigurationen. Ladda om sidan.");
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reload, toast]);
  useEffect(() => {
    if (mode === "demo") {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data, settings }));
      } catch {
        toast("Webbläsaren kunde inte spara demodata.");
      }
    }
  }, [mode, data, settings, toast]);
  const mutate = async (
    entity: Entity,
    payload: Record<string, unknown>,
    id?: string,
  ) => {
    setBusy(true);
    try {
      if (mode === "demo") {
        const stamp = new Date().toISOString();
        if (entity === "approvals" && id)
          payload = { ...payload, decided_at: stamp };
        setData((prev) => {
          const rows = prev[entity] as unknown as Record<string, unknown>[];
          const record = id
            ? {
                ...rows.find((r) => r.id === id),
                ...payload,
                updated_at: stamp,
              }
            : { ...payload, id: crypto.randomUUID(), created_at: stamp };
          return {
            ...prev,
            [entity]: id
              ? rows.map((r) => (r.id === id ? record : r))
              : [record, ...rows],
            activities: [
              {
                id: crypto.randomUUID(),
                created_at: stamp,
                title: id ? "Post uppdaterad" : "Ny post skapad",
                description: String(payload.title || payload.name || entity),
                kind: entity,
              },
              ...prev.activities,
            ],
          };
        });
      } else if (mode === "live") {
        await api(`/api/records/${entity}${id ? `/${id}` : ""}`, {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
        await reload();
      } else throw new Error("Logga in eller konfigurera din arbetsyta först.");
      toast("Sparat" + (mode === "demo" ? " i din lokala demo." : "."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (entity: Entity, id: string) => {
    setBusy(true);
    try {
      if (mode === "demo") {
        setData((prev) => ({
          ...prev,
          [entity]: prev[entity].filter((r) => r.id !== id),
        }));
      } else {
        await api(`/api/records/${entity}/${id}`, { method: "DELETE" });
        await reload();
      }
      toast("Posten har tagits bort.");
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = async (next: Settings) => {
    if (mode === "live")
      await api("/api/workspace", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
    setSettings(next);
    toast("Inställningarna är sparade.");
  };
  const resetDemo = () => {
    setData(demoWorkspace());
    setSettings(defaultSettings);
    toast("Demodatan är återställd.");
  };
  return {
    data,
    mode,
    config,
    settings,
    email,
    notice,
    busy,
    toast,
    mutate,
    remove,
    reload,
    saveSettings,
    resetDemo,
  };
}
export type WorkspaceState = ReturnType<typeof useWorkspace>;
