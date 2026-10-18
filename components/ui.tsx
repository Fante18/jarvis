"use client";
import { Target, X } from "lucide-react";
import { useEffect, useRef } from "react";
export const statusLabels: Record<string, string> = {
  new: "Ny",
  unknown: "Okänd",
  consent: "Samtycke",
  legitimate_interest: "Intresseavvägning",
  supported: "Stöds av test",
  refuted: "Motbevisat",
  inconclusive: "Oklart",
  analyzing: "Analyseras",
  qualified: "Kvalificerad",
  archived: "Arkiverad",
  active: "Tillgänglig",
  paused: "Pausad",
  pending: "Väntar på beslut",
  approved: "Godkänd",
  rejected: "Avslagen",
  contacted: "Kontaktad",
  proposal: "Offert",
  won: "Vunnen",
  lost: "Förlorad",
  running: "Körs",
  completed: "Slutförd",
  failed: "Misslyckad",
  high: "Hög",
  medium: "Medel",
  low: "Låg",
};
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value}`}>
      <span />
      {statusLabels[value] || value}
    </span>
  );
}
export function Empty({
  text,
  action,
}: {
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Target size={28} />
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  disabledRef.current = closeDisabled;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("input,button,textarea,select")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabledRef.current) closeRef.current();
      if (e.key === "Tab" && root) {
        const els = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
          ),
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Stäng"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Orb({ small = false }: { small?: boolean }) {
  return (
    <div className={`orb ${small ? "orb-small" : ""}`} aria-hidden="true">
      <div className="orb-ring" />
      <div className="orb-core" />
      <i />
      <i />
      <i />
    </div>
  );
}
