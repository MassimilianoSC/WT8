/**
 * Primo ADMIN (cutover 3.5, D-173, PR-04, PR-19). Sostituisce il seed della beta in getDb():
 * - si crea SOLO se nel database non c'è nessun ADMIN attivo e ADMIN_EMAIL/ADMIN_PASSWORD sono impostati;
 * - nasce con mustChangePassword: al primo accesso deve cambiare la password prima di fare altro;
 * - la password non si riallinea MAI all'ambiente e un utente già esistente con quell'email non si tocca: nessun
 *   avvio cambia dati esistenti (PR-04);
 * - mai account demo (anche su practicehub_prod resta il divieto assoluto del seed demo, D-158).
 */
import { ObjectId, type Db } from "mongodb";
import { hashPassword } from "@/lib/password";
import { store } from "@/lib/store/db";

export type FirstAdminResult = "created" | "admin-exists" | "email-taken" | "not-configured";

export async function ensureFirstAdmin(db: Db, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): Promise<FirstAdminResult> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? "";
  if (!email || !password) return "not-configured";
  if (await store.users(db).findOne({ isAdmin: true, status: "active" }, { projection: { _id: 1 } })) return "admin-exists";
  if (await store.users(db).findOne({ email }, { projection: { _id: 1 } })) {
    console.warn(`[avvio] nessun ADMIN attivo, ma l'utente ${email} esiste già: non viene modificato`);
    return "email-taken";
  }
  try {
    await store.users(db).insertOne({
      _id: new ObjectId(),
      email,
      name: "Amministratore",
      passwordHash: await hashPassword(password),
      status: "active",
      isAdmin: true,
      memberships: [],
      authVersion: 1,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    // Due avvii insieme: l'indice unico sull'email ne lascia passare uno solo.
    if ((e as { code?: number }).code === 11000) return "admin-exists";
    throw e;
  }
  console.log(`[avvio] creato il primo ADMIN ${email}: dovrà cambiare la password al primo accesso`);
  return "created";
}

const globalForAdmin = global as unknown as { _firstAdmin?: Map<string, Promise<FirstAdminResult>> };
const done = globalForAdmin._firstAdmin ?? (globalForAdmin._firstAdmin = new Map());

/** ensureFirstAdmin una sola volta per processo e per database (al primo tentativo di accesso). */
export function ensureFirstAdminOnce(db: Db): Promise<FirstAdminResult> {
  const key = db.databaseName;
  if (!done.has(key)) {
    done.set(
      key,
      ensureFirstAdmin(db).catch((e) => {
        done.delete(key);
        throw e;
      })
    );
  }
  return done.get(key)!;
}
