"use client";
import type { WorkspaceState } from "@/lib/use-workspace";
import { CheckCheck, Lightbulb, ShieldCheck } from "lucide-react";
import { Empty } from "./ui";
export default function ActivityList({
  state,
  limit,
}: {
  state: WorkspaceState;
  limit: number;
}) {
  return (
    <div className="activity-list">
      {state.data.activities.slice(0, limit).map((a, i) => (
        <div className="activity-item" key={a.id}>
          <div className={`activity-icon activity-${i % 3}`}>
            {i % 3 === 0 ? (
              <Lightbulb size={13} />
            ) : i % 3 === 1 ? (
              <CheckCheck size={13} />
            ) : (
              <ShieldCheck size={13} />
            )}
          </div>
          <div>
            <strong>{a.title}</strong>
            <p>{a.description}</p>
            <time>
              {new Date(a.created_at).toLocaleString("sv-SE", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        </div>
      ))}
      {!state.data.activities.length && (
        <Empty text="Aktivitet visas när arbetsytan används." />
      )}
    </div>
  );
}
