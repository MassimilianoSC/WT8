import type { StatoAttivita } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { STATO_LABEL, STATI_CONCLUSIVI } from "@/components/pratiche/labels";

// Signal colors of the design system (tailwind `status.*` tokens).
const SIGNAL = {
  created: "#002EA6",
  progress: "#FFC000",
  completed: "#008550", // 4.7:1 with white and on white (was #00A35C, 3.3:1); tailwind status.completed matches
  error: "#E60000",
  pending: "#555555",
} as const;

type Signal = keyof typeof SIGNAL;

/**
 * Outline badges in the dark theme: the light-theme signals are too dark on the
 * dark card (blue 1.7:1, grey 2.5:1, red 3.9:1). Lighter tints of the same
 * signal reach at least 4.5:1 (blue 7.5, red 6.7, grey 7.4); green keeps the
 * lighter #00A35C (5.6). Yellow keeps the foreground text; filled badges are unchanged.
 */
const SIGNAL_DARK: Record<Signal, string> = {
  created: "#7EA2FF",
  progress: SIGNAL.progress,
  completed: "#00A35C", // the lighter green reads better on the dark card (5.6:1)
  error: "#FF6B6B",
  pending: "#A3A3A3",
};

/** Color map of the 12 states (D-122). */
const STATO_SIGNAL: Record<StatoAttivita, Signal> = {
  CREATA: "created",
  ASSEGNATO: "progress",
  IN_APPROVAZIONE: "progress",
  PROTOCOLLATO: "progress",
  INTEGRAZIONE_RICHIESTA: "error",
  AUTORIZZATO: "completed",
  DINIEGATO: "error",
  TAR: "error",
  REALIZZATO: "completed",
  TERMINATO: "completed",
  STAND_BY: "pending",
  KO: "error",
};

/**
 * Stato attività badge. Outline = open practice, filled = concluding state.
 * Yellow has too little contrast as text on white, so it only colors the
 * border and the square; text stays in the foreground color (black on a
 * filled yellow badge).
 */
export function StatoBadge({
  stato,
  className,
  wrap = false,
}: {
  stato: StatoAttivita;
  className?: string;
  /**
   * In fixed-width cells (Stato attività grid, statistics) a long label
   * ("INTEGRAZIONE RICHIESTA") wraps inside the badge instead of spilling over
   * the next cell, at any width (360 px, zoom 200%). Elsewhere it stays on one line.
   */
  wrap?: boolean;
}) {
  const signal = STATO_SIGNAL[stato] ?? "pending";
  const color = SIGNAL[signal];
  const filled = STATI_CONCLUSIVI.includes(stato);
  const yellow = signal === "progress";

  // Outline: the signal through CSS variables, so the dark theme can swap the tint.
  const style = (
    filled
      ? { backgroundColor: color, borderColor: color, color: yellow ? "#000000" : "#FFFFFF" }
      : { "--badge": color, "--badge-dark": SIGNAL_DARK[signal] }
  ) as React.CSSProperties;

  return (
    <span
      data-testid={`stato-badge-${stato.toLowerCase()}`}
      className={cn(
        "inline-flex gap-1.5 border px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider",
        wrap ? "max-w-full items-start text-left [overflow-wrap:anywhere]" : "items-center whitespace-nowrap",
        !filled && "border-[color:var(--badge)] dark:border-[color:var(--badge-dark)]",
        !filled && !yellow && "text-[color:var(--badge)] dark:text-[color:var(--badge-dark)]",
        className
      )}
      style={style}
    >
      <span
        className={cn("h-2 w-2 shrink-0", wrap && "mt-1", !filled && "bg-[color:var(--badge)] dark:bg-[color:var(--badge-dark)]")}
        style={filled ? { backgroundColor: yellow ? "#000000" : "#FFFFFF" } : undefined}
        aria-hidden
      />
      <span className="min-w-0">{STATO_LABEL[stato] ?? stato}</span>
    </span>
  );
}
