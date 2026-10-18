"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { api, type WorkspaceState } from "./use-workspace";
import {
  defaultControls,
  type Controls,
  type Schedule,
  type Digest,
  type Calibration,
  type CashEntry,
  type SalesDraft,
} from "./automation";
import type { AnalysisSummary } from "./analysis/contracts";
export type Feedback = {
  id: string;
  opportunity_id: string;
  analysis_id: string | null;
  test_reference: string;
  sample_size: number;
  positive_results: number;
  assumption: string;
  result: string;
  verdict: string;
  evidence_url: string;
  observed_at: string;
};
export type Operations = {
  controls: Controls;
  schedules: Schedule[];
  worker_configured: boolean;
  worker_issues: { variable: string; code: string; message: string }[];
  worker_connection_verified: boolean;
  daily_microusd: number;
  monthly_microusd: number;
  digest: Digest | null;
  calibration: Calibration;
  feedback: Feedback[];
  audit: {
    id: string;
    entity: string;
    action: string;
    created_at: string;
    metadata: unknown;
  }[];
  cash: CashEntry[];
  drafts: SalesDraft[];
  totals: {
    receipts_cents: number;
    refunds_cents: number;
    costs_cents: number;
  };
  trend: { day: string; net_cents: number }[];
  analyses: AnalysisSummary[];
  gmail: { email: string | null; configured: boolean; error?: string };
};
const blank = (): Operations => ({
  controls: defaultControls,
  schedules: [],
  worker_configured: false,
  worker_issues: [],
  worker_connection_verified: false,
  daily_microusd: 0,
  monthly_microusd: 0,
  digest: null,
  calibration: { samples: 0, supported: 0, refuted: 0, adjustment: 0 },
  feedback: [],
  audit: [],
  cash: [],
  drafts: [],
  totals: { receipts_cents: 0, refunds_cents: 0, costs_cents: 0 },
  trend: [],
  analyses: [],
  gmail: { email: null, configured: false },
});
export function useOperations(state: WorkspaceState, poll = true) {
  const requestVersion = useRef(0);
  const [data, setData] = useState<Operations>(blank),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const live = state.mode === "live";
  const refresh = useCallback(
    async (force = true) => {
      const version = ++requestVersion.current;
      if (!live) return;
      setLoading(true);
      try {
        const [a, c, r, g] = await Promise.all([
          api(force ? "/api/automation?refresh=1" : "/api/automation"),
          api("/api/crm"),
          api("/api/ai/analyses"),
          // Integration failures must not hide the worker diagnostic or saved budgets.
          api("/api/integrations/gmail").catch(() => ({
            email: null,
            configured: false,
            error:
              "Gmails anslutningsstatus kunde inte kontrolleras. Kontrollera serverkonfigurationen och försök igen.",
          })),
        ]);
        if (version !== requestVersion.current) return;
        setData({ ...blank(), ...a, ...c, analyses: r.analyses, gmail: g });
        setError(g.error || "");
      } catch (e) {
        if (version === requestVersion.current) setError((e as Error).message);
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [live],
  );
  useEffect(() => {
    if (!live) {
      setData(blank());
      return;
    }
    void refresh(false);
    if (!poll) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, 30000);
    return () => clearInterval(timer);
  }, [live, refresh, poll]);
  async function act(path: string, payload: unknown) {
    setBusy(true);
    try {
      const r = await api(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
      return r;
    } finally {
      setBusy(false);
    }
  }
  return { data, error, loading, busy, refresh, act, live };
}
export type OperationsState = ReturnType<typeof useOperations>;
