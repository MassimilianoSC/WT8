/**
 * Seed demo del modello nuovo (D-69): parte solo dallo script con SEED_DEMO=true. Deterministico e
 * ripetibile: id derivati da chiavi stabili, documenti inseriti solo se mancano ($setOnInsert), quindi un
 * secondo giro non duplica nulla e non riscrive password o ruoli cambiati a mano. Password dall'ambiente
 * (R-10), mai nel codice.
 *
 * Scenari (architettura §1.6): almeno un PM leader per gestore (D-101) e un leader per gruppo; ADMIN;
 * un utente con più appartenenze; una pratica per gestore con due iterazioni, G7 ripetuto, rilavorazione,
 * più cicli ARPA, pratica archiviata, Vincolo PRESENTE con voce Ente collegata.
 */
import { createHash } from "node:crypto";
import { ObjectId, type Collection, type Db, type Filter, type UpdateFilter } from "mongodb";
import type { FieldValue, GroupId, MembershipDTO, RoleId, StatoAttivita, TemplateDTO, TemplateId } from "@/lib/contract";
import { ROLE_GROUP, TEMPLATE_IDS } from "@/lib/contract";
import { hashPassword } from "@/lib/password";
import { bootstrapStore, PRODUCTION_DB_NAMES, store } from "@/lib/store/db";
import { romeDate } from "@/lib/calendario";
import { computeFormulas } from "@/lib/engines/formulas";
import { applyState, deriveAutomaticState, newStateMeta } from "@/lib/engines/state";
import { engineSnapshot, progressOf } from "@/lib/practice/detail";
import { buildIteration, buildNewPractice, constraintRows, summaryOf, type PracticeIdentity } from "@/lib/store/practice-factory";
import type { IterationDoc, PracticeDoc, PracticeEventDoc, RepeatRowDoc, StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

export const SEED_EMAIL_DOMAIN = "demo.practicehub.local";

/** ObjectId deterministico da una chiave stabile. */
export const seedId = (key: string) => new ObjectId(createHash("sha1").update(`practicehub-seed:${key}`).digest("hex").slice(0, 24));

/* ---------- utenti ---------- */

interface SeedUser {
  key: string;
  name: string;
  isAdmin?: boolean;
  memberships: MembershipDTO[];
}

const everyTemplate = (role: RoleId, leader: boolean): MembershipDTO[] =>
  TEMPLATE_IDS.map((templateId) => ({ templateId, group: ROLE_GROUP[role], role, leader }));

export const SEED_USERS: SeedUser[] = [
  { key: "admin", name: "Demo Admin", isAdmin: true, memberships: [] },
  { key: "pm.leader", name: "Demo PM leader", memberships: everyTemplate("PM", true) },
  { key: "pm", name: "Demo PM", memberships: everyTemplate("PM", false) },
  { key: "permessi", name: "Demo Permessi", memberships: everyTemplate("PERMESSI", false) },
  { key: "ut.leader", name: "Demo UT leader", memberships: everyTemplate("UT", true) },
  { key: "ut", name: "Demo UT", memberships: everyTemplate("UT", false) },
  { key: "pe", name: "Demo PE", memberships: everyTemplate("PE", false) },
  { key: "aie.leader", name: "Demo AIE leader", memberships: everyTemplate("AIE", true) },
  { key: "aie", name: "Demo AIE", memberships: everyTemplate("AIE", false) },
  { key: "dl.leader", name: "Demo DL leader", memberships: everyTemplate("DL", true) },
  { key: "dl", name: "Demo DL", memberships: everyTemplate("DL", false) },
  {
    key: "multi",
    name: "Demo più appartenenze",
    memberships: [
      { templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false },
      { templateId: "INWIT", group: "DL", role: "DL", leader: false },
      { templateId: "TOWERNET", group: "PM_PERMESSI", role: "PM", leader: false },
    ],
  },
];

export const seedEmail = (key: string) => `${key}@${SEED_EMAIL_DOMAIN}`;

/* ---------- campi per etichetta (solo nel seed: fallisce se l'etichetta non esiste) ---------- */

function field(t: TemplateDTO, label: string, sectionKey?: string): string {
  const hits = t.occurrences.filter((o) => o.kind === "MASTER" && o.label === label && (!sectionKey || o.sectionKey === sectionKey));
  if (hits.length !== 1) throw new Error(`Seed: campo "${label}" ${sectionKey ?? ""} trovato ${hits.length} volte in ${t.id}`);
  return hits[0].flowId!;
}
const groupFields = (t: TemplateDTO, key: string) => {
  const g = t.repeatGroups.find((x) => x.key === key);
  if (!g) throw new Error(`Seed: gruppo ${key} assente in ${t.id}`);
  return g.flowIds;
};

/* ---------- pratiche ---------- */

interface PracticePlan {
  key: string;
  templateId: TemplateId;
  identity: PracticeIdentity;
  stato: StatoAttivita;
  enabledGroups?: GroupId[];
  values?: (t: TemplateDTO) => Record<string, FieldValue>;
  origin?: string;
  archived?: boolean;
}

const sel = (code: string) => ({ code });
const PLANS: PracticePlan[] = [
  {
    key: "ILIAD-1",
    templateId: "ILIAD",
    identity: { codiceG7: "1000001", codiceSito: "IL-TO-0001", nomeSito: "Torino Lingotto", committente: sel("CELLNEX"), clienteFinale: sel("ILIAD") },
    stato: "ASSEGNATO",
    enabledGroups: ["UT_PE"],
    values: (t) => ({ [field(t, "Tipologia sito")]: sel("RAW_LAND"), [field(t, "Data assegnazione", "PM_PERMESSI.FASE_PRELIMINARE")]: "2026-09-15" }),
  },
  {
    key: "TOWERNET-1",
    templateId: "TOWERNET",
    identity: { codiceG7: "1000002", codiceSito: "TN-MI-0001", nomeSito: "Milano Bovisa", committente: sel("TOWERNET"), clienteFinale: sel("TOWERNET") },
    stato: "CREATA",
  },
  {
    key: "TOWERNET-2",
    templateId: "TOWERNET",
    // Stesso Codice G7 della TOWERNET-1 su un altro sito: G7 non è univoco (D-24).
    identity: { codiceG7: "1000002", codiceSito: "TN-MI-0002", nomeSito: "Milano Lambrate", committente: sel("TOWERNET"), clienteFinale: sel("TOWERNET") },
    stato: "CREATA",
  },
  {
    key: "TIM-1",
    templateId: "TIM_FIBERCOP",
    identity: { codiceG7: "1000003", codiceSito: "TF-RM-0001", nomeSito: "Roma Ostiense", committente: sel("FIBERCOP"), clienteFinale: sel("TIM") },
    stato: "PROTOCOLLATO",
    values: (t) => ({ [field(t, "Data assegnazione", "PM_PERMESSI.FASE_PRELIMINARE")]: "2026-08-01" }),
  },
  {
    key: "INWIT-1",
    templateId: "INWIT",
    identity: { codiceG7: "1000004", codiceSito: "IN-NA-0001", nomeSito: "Napoli Centrale", committente: sel("TODOS"), clienteFinale: sel("INWIT") },
    stato: "KO",
    values: (t) => ({ [field(t, "Data assegnazione", "PM_PERMESSI.FASE_PRELIMINARE")]: "2026-06-10" }),
  },
  {
    key: "FV-1",
    templateId: "FASTWEB_VODAFONE",
    identity: { codiceG7: "1000005", codiceSito: "FV-BO-0001", nomeSito: "Bologna Fiera", committente: sel("FASTWEB"), clienteFinale: sel("VODAFONE") },
    stato: "TERMINATO",
    archived: true,
  },
  {
    key: "LEONARDO-1",
    templateId: "LEONARDO",
    identity: { codiceG7: "1000006", codiceSito: "LE-GE-0001", nomeSito: "Genova Sestri", committente: sel("LEONARDO"), clienteFinale: sel("LEONARDO") },
    stato: "ASSEGNATO",
  },
  {
    key: "LEONARDO-2",
    templateId: "LEONARDO",
    // Rilavorazione della LEONARDO-1 (D-26): nuova pratica, stesso sito, nuovo G7.
    identity: { codiceG7: "1000007", codiceSito: "LE-GE-0001", nomeSito: "Genova Sestri", committente: sel("LEONARDO"), clienteFinale: sel("LEONARDO") },
    stato: "CREATA",
    origin: "LEONARDO-1",
  },
];

export interface SeedResult {
  users: number;
  practices: number;
  inserted: Record<string, number>;
}

/** Inserisce (solo se mancano) utenti e pratiche demo. `now` fisso per un seed riproducibile. */
export async function seedDemo(db: Db, opts: { password: string; now?: Date; adminEmail?: string }): Promise<SeedResult> {
  // D-158: mai sul database di esercizio, con qualunque flag (le credenziali demo non devono esistere in uso reale, D-152).
  if (PRODUCTION_DB_NAMES.includes(db.databaseName)) throw new Error(`Seed demo rifiutato: "${db.databaseName}" è il database di esercizio (D-158)`);
  if (!opts.password || opts.password.length < 8) throw new Error("SEED_DEMO_PASSWORD mancante o più corta di 8 caratteri");
  const now = opts.now ?? new Date("2026-10-01T08:00:00Z");
  await bootstrapStore(db, now);
  const inserted: Record<string, number> = {};
  const count = (name: string, n: number) => (inserted[name] = (inserted[name] ?? 0) + n);

  /* utenti (una sola password demo: l'hash bcrypt si calcola una volta) */
  const passwordHash = await hashPassword(opts.password);
  for (const u of SEED_USERS) {
    const doc: Omit<StoreUserDoc, "_id"> = {
      // L'ADMIN può avere l'email dell'admin della beta, così l'anteprima lo riconosce (D-105).
      email: u.key === "admin" && opts.adminEmail ? opts.adminEmail.trim().toLowerCase() : seedEmail(u.key),
      name: u.name,
      passwordHash,
      status: "active",
      isAdmin: !!u.isAdmin,
      memberships: u.memberships,
      authVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    const r = await store.users(db).updateOne({ _id: seedId(`user:${u.key}`) }, { $setOnInsert: doc }, { upsert: true });
    count("users", r.upsertedCount);
  }
  const createdBy = seedId("user:pm.leader");

  /* pratiche */
  const insertOnce = async <T extends { _id: ObjectId }>(name: string, coll: Collection<T>, doc: T) => {
    const { _id, ...rest } = doc;
    const r = await coll.updateOne({ _id } as Filter<T>, { $setOnInsert: rest } as UpdateFilter<T>, { upsert: true });
    count(name, r.upsertedCount);
  };
  const event = (p: PracticeDoc, it: IterationDoc, kind: PracticeEventDoc["kind"], detail: string, index = 0): PracticeEventDoc => ({
    _id: seedId(`event:${p._id.toHexString()}:${kind}:${it.n}:${index}`),
    operationId: `seed:${p._id.toHexString()}:${kind}:${it.n}`,
    opKey: `seed|${p._id.toHexString()}:${kind}:${it.n}`,
    eventIndex: index,
    practiceId: p._id,
    iterationId: it._id,
    n: it.n,
    kind,
    actorId: createdBy,
    actorName: "Demo PM leader",
    source: "SYSTEM",
    timestamp: now,
    detail,
  });

  for (const plan of PLANS) {
    const t = COMPILED_TEMPLATES[plan.templateId].template;
    const practiceId = seedId(`practice:${plan.key}`);
    const built = buildNewPractice({
      practiceId,
      iterationId: seedId(`iteration:${plan.key}:1`),
      templateId: plan.templateId,
      template: t,
      identity: plan.identity,
      values: plan.values?.(t),
      createdBy,
      originPracticeId: plan.origin ? seedId(`practice:${plan.origin}`) : null,
      enabledGroups: plan.enabledGroups,
      now,
    });
    const rows: RepeatRowDoc[] = constraintRows(t, { practiceId, iterationId: built.iteration._id }, now, (o) => seedId(`row:${plan.key}:1:VINCOLI:${o}`));
    let iteration = built.iteration;
    const extraIterations: IterationDoc[] = [];
    const events: PracticeEventDoc[] = [event(built.practice, iteration, plan.origin ? "REWORK" : "CREATE", plan.origin ? `Rilavorazione di ${plan.origin}` : "Pratica creata (seed demo)")];

    if (plan.key === "ILIAD-1") {
      // Vincolo Monumentale PRESENTE con la voce Ente collegata e bloccata (D-35, D-99).
      const monumentale = rows.find((r) => r.constraint?.code === "MONUMENTALE")!;
      monumentale.constraint = { code: "MONUMENTALE", stato: sel("PRESENTE"), ente: sel("SOPRINTENDENZA") };
      const [nomeEnte] = groupFields(t, "ENTE");
      rows.push({
        _id: seedId(`row:${plan.key}:1:ENTE:1`),
        practiceId,
        iterationId: iteration._id,
        groupKey: "ENTE",
        ordinal: 1,
        values: { [nomeEnte]: "Soprintendenza" },
        metadata: { origin: { groupKey: "VINCOLI", rowId: monumentale._id }, locked: true },
        createdAt: now,
        updatedAt: now,
      });
    }
    if (plan.key === "TIM-1") {
      // Due cicli ARPA: il primo con esito Negativo e Ripresentazione Pratica, il secondo aperto.
      const [forecast, parere, esito, , ripresentazione] = groupFields(t, "ARPA");
      const arpa = (ordinal: number, values: Record<string, FieldValue>): RepeatRowDoc => ({
        _id: seedId(`row:${plan.key}:1:ARPA:${ordinal}`),
        practiceId,
        iterationId: iteration._id,
        groupKey: "ARPA",
        ordinal,
        values,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });
      rows.push(
        arpa(1, { [forecast]: "2026-08-20", [parere]: "2026-08-25", [esito]: sel("NEGATIVO"), [ripresentazione]: "2026-09-01" }),
        arpa(2, { [forecast]: "2026-09-20" })
      );
    }
    if (plan.key === "INWIT-1") {
      // Due iterazioni: la prima chiusa in KO con un'integrazione, la seconda corrente (ripresentazione totale, D-25).
      const [richiesta, note, invio] = groupFields(t, "INTEGRAZIONE");
      rows.push({
        _id: seedId(`row:${plan.key}:1:INTEGRAZIONE:1`),
        practiceId,
        iterationId: iteration._id,
        groupKey: "INTEGRAZIONE",
        ordinal: 1,
        values: { [richiesta]: "2026-07-01", [note]: "Documentazione integrativa richiesta", [invio]: "2026-07-20" },
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });
      iteration = { ...iteration, closedAt: now };
      const second = buildIteration({
        practiceId,
        iterationId: seedId(`iteration:${plan.key}:2`),
        n: 2,
        template: t,
        values: { ...iteration.values, F001: 1000014 },
        now,
      });
      extraIterations.push(second);
      rows.push(...constraintRows(t, { practiceId, iterationId: second._id }, now, (o) => seedId(`row:${plan.key}:2:VINCOLI:${o}`)));
      events.push(event(built.practice, second, "RESUBMIT", "Ripresentazione totale (seed demo)"));
    }

    // D-143: come un salvataggio, campi calcolati e stato passano dagli stessi motori (niente "Sistema" al primo
    // salvataggio dell'utente). Lo stato del piano, se diverso da quello automatico, è uno stato impostato a mano.
    const settle = (it: IterationDoc, stato?: StatoAttivita) => {
      const itRows = rows.filter((r) => r.iterationId.equals(it._id));
      const snap = engineSnapshot(it, itRows);
      const res = computeFormulas({
        templateId: plan.templateId,
        template: t,
        bindings: COMPILED_TEMPLATES[plan.templateId].bindings,
        before: snap,
        after: snap,
        today: romeDate(now),
        now,
        operationId: `seed:${plan.key}:${it.n}`,
        actorId: null,
        manualWrites: new Set(),
        fatturabileWritten: false,
      });
      it.values = { ...it.values, ...res.values };
      it.formulaMeta = { ...it.formulaMeta, ...res.formulaMeta };
      it.transversal = { ...it.transversal, ...res.transversal };
      const auto = deriveAutomaticState({ templateId: plan.templateId, values: it.values, repeats: engineSnapshot(it, itRows).repeats });
      it.stateMeta = applyState(newStateMeta(), auto, stato && stato !== auto.stato ? { stato, actorId: createdBy, at: now } : undefined).next;
    };
    settle(iteration, plan.stato);
    for (const it of extraIterations) settle(it);

    const current = extraIterations[extraIterations.length - 1] ?? iteration;
    const practice: PracticeDoc = {
      ...built.practice,
      currentIterationId: current._id,
      currentIterationN: current.n,
      revision: 1 + extraIterations.length + (plan.archived ? 1 : 0),
      archived: !!plan.archived,
      archivedAt: plan.archived ? now : null,
      currentSummary: summaryOf(current, 0, progressOf(t, current, rows.filter((r) => r.iterationId.equals(current._id)))),
    };
    if (plan.archived) events.push(event(practice, current, "ARCHIVE", "Pratica archiviata (seed demo)"));

    await insertOnce("practices", store.practices(db), practice);
    for (const it of [iteration, ...extraIterations]) await insertOnce("practice_iterations", store.iterations(db), it);
    for (const r of rows) await insertOnce("repeat_rows", store.repeatRows(db), r);
    for (const e of events) await insertOnce("practice_events", store.events(db), e);
  }

  return { users: SEED_USERS.length, practices: PLANS.length, inserted };
}
