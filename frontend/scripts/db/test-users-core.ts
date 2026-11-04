/**
 * Utenti di prova per la prova di carico sull'installazione (via di M, 11/10/2026). Email fittizie su un dominio
 * riservato che non esiste (RFC 2606: ".invalid", nessuna mail può arrivare), password casuali già impostate, nessun
 * invito né cambio password obbligatorio, appartenenze NON leader sui clienti che hanno pratiche (così ognuno vede
 * qualcosa e il requisito D-101 sui PM leader non cambia). Riconoscibili da testAccount=true E dal dominio: solo
 * questi si riattivano, si ricreano o si disattivano. Ogni passaggio scrive una voce di audit (senza password).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { ROLE_GROUP, TEMPLATE_IDS, type MembershipDTO, type RoleId, type TemplateId } from "../../src/lib/contract";
import { hashPassword } from "../../src/lib/password";
import { store } from "../../src/lib/store/db";

export const TEST_DOMAIN = "prova.invalid";
export const TEST_MAX = 100;
const ACTOR = "ops/utenti-prova";
const testFilter = { testAccount: true as const, email: { $regex: `@${TEST_DOMAIN.replace(".", "\\.")}$` } };

/** Soprattutto UT/PE, AIE e DL; due su dieci PM o Permessi. */
const ROLES: RoleId[] = ["UT", "PE", "AIE", "DL", "UT", "PE", "AIE", "DL", "PM", "PERMESSI"];

export interface TestCredential {
  email: string;
  password: string;
  name: string;
  memberships: MembershipDTO[];
}

export const testEmail = (i: number) => `carico${String(i).padStart(2, "0")}@${TEST_DOMAIN}`;

/** Clienti con almeno una pratica non archiviata, nell'ordine dei template. */
async function templatesWithPractices(db: Db): Promise<TemplateId[]> {
  const rows = await store.practices(db).aggregate<{ _id: TemplateId }>([{ $match: { archived: false } }, { $group: { _id: "$templateId" } }]).toArray();
  const have = new Set(rows.map((r) => r._id));
  return TEMPLATE_IDS.filter((t) => have.has(t));
}

/** Piano degli utenti (senza password): ruolo a rotazione, uno o due clienti con pratiche. */
export function planTestUsers(n: number, templates: TemplateId[]): Omit<TestCredential, "password">[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    const role = ROLES[k % ROLES.length];
    const mine = [...new Set([templates[k % templates.length], ...(i % 2 === 0 ? [templates[(k + 2) % templates.length]] : [])])];
    return {
      email: testEmail(i),
      name: `Prova carico ${String(i).padStart(2, "0")}`,
      memberships: mine.map((templateId) => ({ templateId, group: ROLE_GROUP[role], role, leader: false })),
    };
  });
}

/**
 * Crea (o ricrea con password nuove) gli utenti carico01…caricoNN. Rifiuta, senza scrivere niente, se una di quelle
 * email appartiene a un utente vero (senza testAccount). `beforeWrite` riceve le credenziali PRIMA delle scritture
 * (il chiamante le salva su file: se il file non si scrive, il database non cambia).
 */
export async function createTestUsers(
  db: Db,
  opts: { n: number; now?: Date; beforeWrite?: (c: TestCredential[]) => void | Promise<void> }
): Promise<{ created: number; updated: number; byRole: Record<string, number>; byTemplate: Record<string, number> }> {
  const now = opts.now ?? new Date();
  if (!Number.isInteger(opts.n) || opts.n < 1 || opts.n > TEST_MAX) throw new Error(`Numero di utenti non valido: da 1 a ${TEST_MAX}.`);
  const templates = await templatesWithPractices(db);
  if (!templates.length) throw new Error("Nessuna pratica attiva nel database: importa prima i dati fittizi.");
  const plan = planTestUsers(opts.n, templates);
  const existing = await store.users(db).find({ email: { $in: plan.map((p) => p.email) } }, { projection: { email: 1, testAccount: 1 } }).toArray();
  const real = existing.filter((u) => u.testAccount !== true);
  if (real.length) throw new Error(`Rifiutato: ${real.length} email di prova appartengono a utenti veri (non marcati come prova). Nessuna modifica.`);

  const credentials: TestCredential[] = plan.map((p) => ({ ...p, password: randomBytes(18).toString("base64url") }));
  await opts.beforeWrite?.(credentials);

  const ids: ObjectId[] = [];
  let created = 0;
  for (const c of credentials) {
    const r = await store.users(db).findOneAndUpdate(
      { email: c.email },
      {
        $set: { name: c.name, passwordHash: await hashPassword(c.password), status: "active", isAdmin: false, memberships: c.memberships, testAccount: true, updatedAt: now },
        $setOnInsert: { createdAt: now },
        $inc: { authVersion: 1 },
        $unset: { mustChangePassword: "" },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true }
    );
    if (!r.lastErrorObject?.updatedExisting) created++;
    ids.push(r.value!._id);
  }
  await store.auditLog(db).insertOne({ _id: new ObjectId(), kind: "TEST_USERS", action: "CREATE", actorId: null, actorName: ACTOR, at: now, operationId: randomUUID(), users: ids, count: ids.length });

  const byRole: Record<string, number> = {};
  const byTemplate: Record<string, number> = {};
  for (const c of credentials) {
    byRole[c.memberships[0].role] = (byRole[c.memberships[0].role] ?? 0) + 1;
    for (const m of c.memberships) byTemplate[m.templateId] = (byTemplate[m.templateId] ?? 0) + 1;
  }
  return { created, updated: ids.length - created, byRole, byTemplate };
}

/** Disattiva tutti gli utenti di prova ancora attivi o invitati (authVersion cresce: le sessioni aperte cadono). */
export async function disableTestUsers(db: Db, opts: { now?: Date } = {}): Promise<{ disabled: number }> {
  const now = opts.now ?? new Date();
  const ids = (await store.users(db).find({ ...testFilter, status: { $ne: "deactivated" } }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
  if (!ids.length) return { disabled: 0 };
  await store.users(db).updateMany({ _id: { $in: ids }, ...testFilter }, { $set: { status: "deactivated", updatedAt: now }, $inc: { authVersion: 1 } });
  await store.auditLog(db).insertOne({ _id: new ObjectId(), kind: "TEST_USERS", action: "DISABLE", actorId: null, actorName: ACTOR, at: now, operationId: randomUUID(), users: ids, count: ids.length });
  return { disabled: ids.length };
}
