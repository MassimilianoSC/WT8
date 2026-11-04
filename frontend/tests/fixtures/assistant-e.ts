/**
 * Fixture E dell'assistente (PROGETTO_ASSISTENTE_AI_v1 §13.3): il seed S0 (seed-demo.ts) più dati SOLO DI PROVA per
 * i casi positivi e per i divieti (canarini nelle note di gruppi non visibili). Non cambia il seed demo ordinario:
 * scrive direttamente nel database usa-e-getta, tenendo coerenti riepilogo, contatore alert e revisione.
 *
 * Orologi: seed a S0_NOW, domande a E_NOW (09/10/2026 10:00 Roma). Id deterministici come nel seed (seedId).
 */
import { ObjectId, type Db } from "mongodb";
import type { FieldValue, GroupId } from "@/lib/contract";
import { progressOf } from "@/lib/practice/detail";
import { notesOf } from "@/lib/practice/notes";
import { seedDemo, seedId } from "@/lib/store/seed-demo";
import { store } from "@/lib/store/db";
import { summaryOf } from "@/lib/store/practice-factory";
import type { AlertDoc, IterationDoc, ValueHistoryDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { CALENDAR_VERSION } from "@/services/alerts-engine";

export const S0_NOW = new Date("2026-10-01T08:00:00Z");
export const E_NOW = new Date("2026-10-09T08:00:00Z");
export const E_PASSWORD = "Prova-Assistente-2026";

/** Note Operative della fixture E: AIE e DL sono canarini che non devono MAI uscire verso chi non le vede (D-121). */
export const E_NOTES: Record<GroupId, string> = {
  PM_PERMESSI: "In attesa del documento del committente dal 07/10",
  UT_PE: "Relazione strutturale da completare",
  AIE: "CANARY_AIE_E",
  DL: "CANARY_DL_E",
};
/** Nota PM della variante di storico "legacy" (voce senza noteGroup: appartiene a PM/Permessi). */
export const E_LEGACY_NOTE = "CANARY_LEGACY_PM_E";

export const E_PRACTICE_KEYS = ["ILIAD-1", "TOWERNET-1", "TOWERNET-2", "TIM-1", "INWIT-1", "FV-1", "LEONARDO-1", "LEONARDO-2"] as const;
export type EPracticeKey = (typeof E_PRACTICE_KEYS)[number];

export const eIds = {
  practice: (k: EPracticeKey) => seedId(`practice:${k}`),
  user: (k: string) => seedId(`user:${k}`),
  iteration: (k: EPracticeKey, n = 1) => seedId(`iteration:${k}:${n}`),
  row: (k: EPracticeKey, n: number, group: string, ordinal: number | string) => seedId(`row:${k}:${n}:${group}:${ordinal}`),
};

/** Seed S0 (seed demo con l'orologio del progetto). */
export async function seedS0(db: Db): Promise<void> {
  await seedDemo(db, { password: E_PASSWORD, now: S0_NOW });
}

export interface FixtureEOptions {
  /** E-alert: tre alert aperti (ILIAD FORECAST_UT e FORECAST_PE il 12/10, TIM PARERE_ARPA riga 2 il 23/09). */
  alerts?: boolean;
  /** E-history: due modifiche di Note Operative del 07/10 su ILIAD-1 (PM_PERMESSI e UT_PE). */
  history?: boolean;
  /** Variante legacy: una voce di storico della nota senza noteGroup (= PM_PERMESSI). */
  legacyHistory?: boolean;
  /** Variante con AIE abilitato su ILIAD-1 (solo per le prove di scrittura delle note). */
  aieEnabled?: boolean;
  /** Testo alternativo della nota UT_PE (es. injection I01). */
  utNote?: string;
}

const user = (k: string): FieldValue => ({ code: eIds.user(k).toHexString() });
const users = (...k: string[]): FieldValue => k.map((x) => ({ code: eIds.user(x).toHexString() })) as FieldValue;

/** Aggiorna valori e note dell'iterazione corrente, con riepilogo e revisione coerenti. */
async function patchCurrent(db: Db, key: EPracticeKey, values: Record<string, FieldValue>, notes?: Partial<Record<GroupId, string>>, enabledGroups?: GroupId[]) {
  const practiceId = eIds.practice(key);
  const p = (await store.practices(db).findOne({ _id: practiceId }))!;
  const it = (await store.iterations(db).findOne({ _id: p.currentIterationId }))!;
  const next: IterationDoc = {
    ...it,
    values: { ...it.values, ...values },
    transversal: notes ? { ...it.transversal, noteOperative: { ...notesOf(it.transversal), ...notes } } : it.transversal,
  };
  const rows = await store.repeatRows(db).find({ iterationId: it._id }).toArray();
  const t = COMPILED_TEMPLATES[p.templateId].template;
  await store.iterations(db).replaceOne({ _id: it._id }, next);
  await store.practices(db).updateOne(
    { _id: practiceId },
    {
      $set: {
        currentSummary: summaryOf(next, p.currentSummary.openAlerts, progressOf(t, next, rows)),
        ...(enabledGroups ? { enabledGroups } : {}),
        updatedAt: E_NOW,
      },
      $inc: { revision: 1 },
    }
  );
}

function alertDoc(key: EPracticeKey, ruleId: string, subject: AlertDoc["subject"], dueLocalDate: string, dueAt: Date): AlertDoc {
  return {
    _id: seedId(`alert:E:${key}:${ruleId}`),
    practiceId: eIds.practice(key),
    iterationId: eIds.iteration(key),
    ruleId,
    subject,
    episodeKey: `E:${key}:${ruleId}:${subject.rowId?.toHexString() ?? "-"}:1`,
    generation: 1,
    sourceFingerprint: "fixture-e",
    ruleVersion: 1,
    calendarVersion: CALENDAR_VERSION,
    dueLocalDate,
    dueAt,
    status: "OPEN",
    executionStatus: "ACTIVE",
    openedAt: new Date("2026-10-05T07:00:00Z"),
    closedAt: null,
    closeMode: null,
    closedBy: null,
    closeReason: null,
    recipientsSnapshot: [],
    nextReminderAt: null,
  };
}

function noteHistory(index: number, group: GroupId | null, newValue: string, templateVersion: string): ValueHistoryDoc {
  const practiceId = eIds.practice("ILIAD-1");
  return {
    _id: seedId(`history:E:ILIAD-1:${index}`),
    operationId: `fixture-e-${index}`,
    opKey: `fixture-e|${index}`,
    changeIndex: 0,
    practiceId,
    iterationId: eIds.iteration("ILIAD-1"),
    n: 1,
    templateVersion,
    kind: "FIELD",
    target: group ? { transversal: "noteOperative", noteGroup: group } : { transversal: "noteOperative" },
    oldValue: "",
    newValue,
    actorId: eIds.user(group === "UT_PE" ? "ut" : "pm.leader"),
    actorName: group === "UT_PE" ? "Demo UT" : "Demo PM leader",
    source: "USER",
    timestamp: new Date(`2026-10-07T0${7 + index}:00:00Z`),
    revision: 2 + index,
  };
}

/** Applica la fixture E sopra S0 (da chiamare una volta su un database appena seminato). */
export async function applyFixtureE(db: Db, opts: FixtureEOptions = {}): Promise<void> {
  // ILIAD-1: Forecast UT 14/10 e Forecast PE 16/10 senza invio, tecnici UT e PE, note dei quattro gruppi.
  await patchCurrent(
    db,
    "ILIAD-1",
    { F126: "2026-10-14", F140: "2026-10-16", F129: user("ut"), F144: users("pe") },
    { ...E_NOTES, ...(opts.utNote !== undefined ? { UT_PE: opts.utNote } : {}) },
    opts.aieEnabled ? ["PM_PERMESSI", "UT_PE", "AIE"] : undefined
  );
  // TOWERNET-1: Forecast PE 15/10 già concluso dall'Invio PE dell'08/10; tecnico PE; UT_PE non abilitato.
  await patchCurrent(db, "TOWERNET-1", { F096: "2026-10-15", F105: "2026-10-08", F100: users("pe") });
  // TIM-1: Forecast PE 08/10, Invio PE (master DL) vuoto; ARPA del seed invariata.
  await patchCurrent(db, "TIM-1", { F097: "2026-10-08" });

  if (opts.alerts) {
    const at9 = (d: string) => new Date(`${d}T07:00:00Z`); // 09:00 Roma (ora legale)
    const docs = [
      alertDoc("ILIAD-1", "FORECAST_UT", { flowId: "F126", sectionKey: "UT_PE.UT" }, "2026-10-12", at9("2026-10-12")),
      alertDoc("ILIAD-1", "FORECAST_PE", { flowId: "F140", sectionKey: "UT_PE.PE" }, "2026-10-12", at9("2026-10-12")),
      alertDoc("TIM-1", "PARERE_ARPA", { flowId: "F058", groupKey: "ARPA", rowId: eIds.row("TIM-1", 1, "ARPA", 2), sectionKey: "PM_PERMESSI.ITER_AUTORIZZATIVO" }, "2026-09-23", at9("2026-09-23")),
    ];
    await store.alerts(db).insertMany(docs);
    await store.practices(db).updateOne({ _id: eIds.practice("ILIAD-1") }, { $set: { "currentSummary.openAlerts": 2 } });
    await store.practices(db).updateOne({ _id: eIds.practice("TIM-1") }, { $set: { "currentSummary.openAlerts": 1 } });
  }

  if (opts.history || opts.legacyHistory) {
    const it = (await store.iterations(db).findOne({ _id: eIds.iteration("ILIAD-1") }))!;
    const docs: ValueHistoryDoc[] = [];
    if (opts.history) docs.push(noteHistory(0, "PM_PERMESSI", E_NOTES.PM_PERMESSI, it.templateVersion), noteHistory(1, "UT_PE", E_NOTES.UT_PE, it.templateVersion));
    if (opts.legacyHistory) docs.push(noteHistory(2, null, E_LEGACY_NOTE, it.templateVersion));
    await store.valueHistory(db).insertMany(docs);
  }
}

/** Nuovo id esadecimale non presente nel seed (pratiche "inesistenti" nelle prove). */
export const absentId = () => new ObjectId().toHexString();
