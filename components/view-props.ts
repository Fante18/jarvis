import {
metrics,
type Agent,
type Entity,
type Opportunity,
} from "@/lib/domain";
import type { WorkspaceState } from "@/lib/use-workspace";
import type { Dispatch,SetStateAction } from "react";
export type ViewProps = {
  state: WorkspaceState;
  stats: ReturnType<typeof metrics>;
  filter: string;
  setFilter: Dispatch<SetStateAction<string>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  days: number;
  setDays: Dispatch<SetStateAction<number>>;
  openEditor: (entity: Entity, record?: object) => void;
  setDetail: Dispatch<SetStateAction<Opportunity | null>>;
  setRunAgent: Dispatch<SetStateAction<Agent | null>>;
  setDeleteTarget: Dispatch<
    SetStateAction<{ entity: Entity; id: string } | null>
  >;
  setActivityOpen: Dispatch<SetStateAction<boolean>>;
  guardError: (fn: () => Promise<unknown>) => Promise<unknown>;
};
