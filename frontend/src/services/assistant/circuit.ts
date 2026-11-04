/**
 * Circuito del provider (progetto §2.4): 5 guasti TECNICI consecutivi in 60 s → circuito aperto per 60 s; la prima
 * domanda dopo è ammessa come sonda. Non contano i rifiuti di sicurezza né i limiti personali. Solo in memoria del
 * processo dell'app: un riavvio lo chiude. Stato pubblico per /api/health senza dati di utenti o costi.
 */
const FAILURES_TO_OPEN = 5;
const WINDOW_MS = 60_000;
const OPEN_MS = 60_000;

interface CircuitState {
  failures: number[];
  openUntil: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

const g = global as unknown as { _assistantCircuit?: CircuitState };
const state = (): CircuitState => (g._assistantCircuit ??= { failures: [], openUntil: 0, lastSuccessAt: null, lastFailureAt: null });

export function circuitOpen(now: Date = new Date()): boolean {
  return state().openUntil > now.getTime();
}

export function recordProviderSuccess(now: Date = new Date()): void {
  const s = state();
  s.failures = [];
  s.openUntil = 0;
  s.lastSuccessAt = now.getTime();
}

export function recordProviderFailure(now: Date = new Date()): void {
  const s = state();
  const t = now.getTime();
  s.lastFailureAt = t;
  s.failures = [...s.failures.filter((x) => t - x < WINDOW_MS), t];
  if (s.failures.length >= FAILURES_TO_OPEN) {
    s.openUntil = t + OPEN_MS;
    s.failures = [];
  }
}

export function circuitSnapshot(now: Date = new Date()): { open: boolean; lastSuccessAt: string | null; lastFailureAt: string | null } {
  const s = state();
  return {
    open: circuitOpen(now),
    lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
    lastFailureAt: s.lastFailureAt ? new Date(s.lastFailureAt).toISOString() : null,
  };
}

/** Solo prove. */
export function resetCircuit(): void {
  g._assistantCircuit = { failures: [], openUntil: 0, lastSuccessAt: null, lastFailureAt: null };
}
