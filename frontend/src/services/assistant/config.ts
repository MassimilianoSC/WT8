/**
 * Configurazione tecnica dell'assistente da deploy/.env (progetto §11.1, D-166…D-172). Letta a ogni uso: niente
 * cache, così le prove possono cambiarla. Una configurazione assente o errata NON ferma l'app: rende l'assistente
 * non disponibile (UNAVAILABLE) e lo dice con un problema leggibile, senza segreti.
 *
 * D-179 (sostituisce D-168 per la regione): solo l'endpoint multi-regione "eu" (aiplatform.eu.rep.googleapis.com,
 * elaborazione garantita nell'UE); mai global, mai us, mai regioni fuori UE, nessun instradamento automatico altrove.
 * D-172: il provider finto (`PH_AI_PROVIDER=fake`) serve a sviluppo e prove; "vertex" usa Gemini su Google Cloud.
 */
import { PRODUCTION_DB_NAMES } from "@/lib/store/db";

export type AssistantProviderKind = "fake" | "vertex";

export interface AssistantConfig {
  /** PH_AI_ENABLED: interruttore tecnico principale; se falso l'interruttore degli ADMIN non può accendere (D-169). */
  technicalEnabled: boolean;
  provider: AssistantProviderKind | null;
  project: string | null;
  location: string | null;
  model: string | null;
  /** Valori iniziali dei limiti personali (D-171): poi decide l'ADMIN da Configurazione. */
  initialDailyLimit: number;
  initialPerMinuteLimit: number;
  /** Domande contemporanee sullo stack (oltre: BUSY). */
  concurrency: number;
  timeoutMs: number;
  logTtlDays: number;
  /** Livello di ragionamento dei modelli Gemini 3.x (PH_AI_THINKING_LEVEL); null = predefinito del modello. */
  thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | null;
  /** Problemi che rendono l'assistente non disponibile; vuoto = configurazione valida. */
  problems: string[];
}

export const DAILY_LIMIT_RANGE = { min: 1, max: 100, initial: 30 } as const;
export const PER_MINUTE_LIMIT_RANGE = { min: 1, max: 10, initial: 4 } as const;

/**
 * Location ammesse (D-179): solo la multi-regione "eu". Le regioni singole (es. europe-west8) non servono i Flash
 * stabili attuali; ampliare solo con una decisione registrata.
 */
export const ALLOWED_LOCATIONS: readonly string[] = ["eu"];

const int = (v: string | undefined, d: number, min: number, max: number) => {
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function assistantConfig(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  const technicalEnabled = (env.PH_AI_ENABLED ?? "").trim().toLowerCase() === "true";
  const providerRaw = str(env.PH_AI_PROVIDER)?.toLowerCase() ?? "vertex";
  const provider = providerRaw === "fake" || providerRaw === "vertex" ? providerRaw : null;
  const cfg: AssistantConfig = {
    technicalEnabled,
    provider,
    project: str(env.GOOGLE_CLOUD_PROJECT),
    location: str(env.PH_AI_LOCATION),
    model: str(env.PH_AI_MODEL),
    initialDailyLimit: int(env.PH_AI_USER_PER_DAY, DAILY_LIMIT_RANGE.initial, DAILY_LIMIT_RANGE.min, DAILY_LIMIT_RANGE.max),
    initialPerMinuteLimit: int(env.PH_AI_USER_PER_MINUTE, PER_MINUTE_LIMIT_RANGE.initial, PER_MINUTE_LIMIT_RANGE.min, PER_MINUTE_LIMIT_RANGE.max),
    concurrency: int(env.PH_AI_CONCURRENCY, 20, 1, 200),
    timeoutMs: int(env.PH_AI_TIMEOUT_MS, 20_000, 1_000, 120_000),
    logTtlDays: int(env.PH_AI_LOG_TTL_DAYS, 30, 1, 365),
    thinkingLevel: (["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const).find((l) => l === str(env.PH_AI_THINKING_LEVEL)?.toUpperCase()) ?? null,
    problems: [],
  };
  if (!technicalEnabled) return cfg;
  if (!provider) cfg.problems.push("PH_AI_PROVIDER non valido (fake o vertex)");
  // Il modello finto risponde con testi di prova: mai sul database di esercizio (D-158).
  if (provider === "fake" && PRODUCTION_DB_NAMES.includes(env.NEW_DB_NAME ?? "")) cfg.problems.push("provider finto non ammesso sul database di esercizio");
  if (provider === "vertex") {
    if (!cfg.project) cfg.problems.push("GOOGLE_CLOUD_PROJECT mancante");
    if (!cfg.model) cfg.problems.push("PH_AI_MODEL mancante");
    if (!cfg.location) cfg.problems.push("PH_AI_LOCATION mancante");
    else if (!ALLOWED_LOCATIONS.includes(cfg.location)) cfg.problems.push(`PH_AI_LOCATION "${cfg.location}" non ammessa: solo ${ALLOWED_LOCATIONS.join(", ")} (D-179)`);
    // Una chiave API cambierebbe il modo di autenticarsi dell'SDK (Gemini API pubblica): si usa solo l'account di servizio.
    if (str(env.GOOGLE_API_KEY) || str(env.GEMINI_API_KEY)) cfg.problems.push("GOOGLE_API_KEY/GEMINI_API_KEY non ammesse: si usa solo l'account di servizio");
    if (!str(env.GOOGLE_APPLICATION_CREDENTIALS)) cfg.problems.push("GOOGLE_APPLICATION_CREDENTIALS mancante");
  }
  return cfg;
}
