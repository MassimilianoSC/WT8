/**
 * Utenti del modello nuovo (B4, D-17–D-19, D-39, D-101) sul database nuovo (D-104), dietro le rotte /api/users e
 * /api/auth/* dal cutover (3.3, 3.5).
 *
 * Le mail (invito, reset, benvenuto) passano dall'outbox nella stessa transazione (D-90): le invia il worker.
 */
import crypto from "node:crypto";
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import {
  ROLE_GROUP,
  TEMPLATE_IDS,
  type AssignableUserDTO,
  type MembershipDTO,
  type RoleId,
  type TemplateId,
  type UserDTO,
  type UserInviteRequest,
  type UserListResponse,
  type UserUpdateRequest,
} from "@/lib/contract";
import { getClient } from "@/lib/db";
import { invitationEmail, resetPasswordEmail, welcomeEmail } from "@/lib/email";
import { andamentoEnabled } from "@/lib/features";
import { HttpError } from "@/lib/http-error";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getStoreDb, store } from "@/lib/store/db";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { runOperation, touchWriteGuard, type OperationContext } from "@/lib/store/transaction";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

export interface StoreDeps {
  client: MongoClient;
  db: Db;
}
export async function storeDeps(): Promise<StoreDeps> {
  return { client: await getClient(), db: await getStoreDb() };
}

const TOKEN_TTL_MS = { invite: 24 * 60 * 60 * 1000, reset: 60 * 60 * 1000 } as const;
const baseUrl = () => process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
const iso = (d: Date) => d.toISOString();
const normEmail = (e: string) => e.trim().toLowerCase();

export function toUserDTO(u: StoreUserDoc): UserDTO {
  return {
    id: u._id.toHexString(),
    name: u.name,
    email: u.email,
    status: u.status,
    isAdmin: u.isAdmin,
    memberships: u.memberships,
    // §15.2: a interruttore spento un "direzione" già salvato non vale niente.
    direzione: andamentoEnabled() && u.direzione === true,
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

/* ---------- coerenza e PM leader (D-17, D-101) ---------- */

/** Nome leggibile del gestore nei messaggi (es. "TIM / FIBERCOP"), come nell'interfaccia. */
const templateLabel = (t: TemplateId) => COMPILED_TEMPLATES[t]?.template.label ?? t;

/** 422 se una coppia gruppo/ruolo non rispetta la tabella D-17 o se un'appartenenza è ripetuta. */
export function assertMembershipsCoherent(memberships: MembershipDTO[]): void {
  const seen = new Set<string>();
  for (const m of memberships) {
    if (ROLE_GROUP[m.role] !== m.group) throw new HttpError(`Ruolo ${m.role} incompatibile con il gruppo ${m.group}`, 422);
    const key = `${m.templateId}|${m.role}`;
    if (seen.has(key)) throw new HttpError(`Appartenenza ripetuta: ${m.templateId} ${m.role}`, 422);
    seen.add(key);
  }
}

const isPmLeaderOn = (u: Pick<StoreUserDoc, "status" | "memberships">, t: TemplateId) =>
  u.status === "active" && u.memberships.some((m) => m.templateId === t && m.role === "PM" && m.leader);

/** Template senza alcun PM leader attivo (D-101 c). */
export async function templatesWithoutPmLeader(db: Db, session?: ClientSession): Promise<TemplateId[]> {
  const users = await store.users(db)
    .find({ status: "active", memberships: { $elemMatch: { role: "PM", leader: true } } }, { session, projection: { status: 1, memberships: 1 } })
    .toArray();
  return TEMPLATE_IDS.filter((t) => !users.some((u) => isPmLeaderOn(u, t)));
}

/** D-101 a: creare una pratica in un template senza PM leader attivo → 422. Da chiamare nella transazione. */
export async function assertTemplateHasPmLeader(db: Db, templateId: TemplateId, session?: ClientSession): Promise<void> {
  const n = await store.users(db).countDocuments(
    { status: "active", memberships: { $elemMatch: { templateId, role: "PM", leader: true } } },
    { session, limit: 1 }
  );
  if (n === 0) throw new HttpError(`Il gestore ${templateLabel(templateId)} non ha un PM leader attivo: chiedi all'ADMIN di nominarne uno`, 422);
}

/** D-101 b: dopo la modifica ogni gestore ATTIVO (con pratiche non archiviate) deve conservare un PM leader. */
async function assertPmLeadersKept(ctx: OperationContext, before: StoreUserDoc, after: Pick<StoreUserDoc, "status" | "memberships">) {
  const losing = TEMPLATE_IDS.filter((t) => isPmLeaderOn(before, t) && !isPmLeaderOn(after, t));
  for (const t of losing) {
    await touchWriteGuard(ctx, `pm-leader:${t}`);
    const others = await store.users(ctx.db).countDocuments(
      { _id: { $ne: before._id }, status: "active", memberships: { $elemMatch: { templateId: t, role: "PM", leader: true } } },
      { session: ctx.session, limit: 1 }
    );
    if (others > 0) continue;
    const activePractices = await store.practices(ctx.db).countDocuments({ templateId: t, archived: false }, { session: ctx.session, limit: 1 });
    if (activePractices > 0) {
      throw new HttpError(`Il gestore ${templateLabel(t)} resterebbe senza PM leader attivo con pratiche aperte: nomina prima un altro PM leader`, 422, {
        templatesWithoutPmLeader: [t],
      });
    }
  }
}

/**
 * Almeno un ADMIN attivo resta sempre (v0.5.4): l'app senza ADMIN non si amministra più e il primo ADMIN dall'ambiente
 * non si ricrea (l'email esiste già, first-admin). Vale per chiunque faccia la modifica, anche su sé stesso. Il
 * contatore comune (write guard) mette in fila due modifiche concorrenti: niente "due ADMIN si tolgono a vicenda".
 */
async function assertAdminKept(ctx: OperationContext, before: StoreUserDoc, after: Pick<StoreUserDoc, "status" | "isAdmin">) {
  const wasActiveAdmin = before.isAdmin && before.status === "active";
  if (!wasActiveAdmin || (after.isAdmin && after.status === "active")) return;
  await touchWriteGuard(ctx, "active-admin");
  const others = await store.users(ctx.db).countDocuments({ _id: { $ne: before._id }, isAdmin: true, status: "active" }, { session: ctx.session, limit: 1 });
  if (others === 0) throw new HttpError("Serve almeno un amministratore attivo", 422, { code: "LAST_ADMIN" });
}

/** §15.2: il profilo Direzione si imposta solo con l'interruttore acceso (spento = 422, il campo non esiste). */
function assertDirezioneAllowed(direzione: boolean | undefined) {
  if (direzione !== undefined && !andamentoEnabled()) throw new HttpError("Il profilo Direzione non è disponibile", 422, { code: "FEATURE_DISABLED" });
}

/* ---------- lettura ---------- */

export async function listUsers(db: Db): Promise<UserListResponse> {
  const users = await store.users(db).find({}).sort({ name: 1, _id: 1 }).toArray();
  return { items: users.map(toUserDTO), templatesWithoutPmLeader: await templatesWithoutPmLeader(db) };
}

/** Utenti attivi con un'appartenenza (template + ruolo) per i campi utente (D-39). */
export async function assignableUsers(db: Db, templateId: TemplateId, role: RoleId): Promise<AssignableUserDTO[]> {
  const users = await store.users(db)
    .find({ status: "active", memberships: { $elemMatch: { templateId, role } } }, { projection: { name: 1 } })
    .sort({ name: 1, _id: 1 })
    .toArray();
  return users.map((u) => ({ id: u._id.toHexString(), name: u.name }));
}

/* ---------- token ---------- */

async function createToken(ctx: OperationContext, userId: ObjectId, type: "invite" | "reset"): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await store.authTokens(ctx.db).insertOne(
    { _id: new ObjectId(), userId, type, token, expiresAt: new Date(ctx.now.getTime() + TOKEN_TTL_MS[type]), usedAt: null, createdAt: ctx.now },
    { session: ctx.session }
  );
  return token;
}

/* ---------- scrittura ---------- */

export interface Actor {
  id: string;
  isAdmin: boolean;
}
const requireAdmin = (a: Actor) => {
  if (!a.isAdmin) throw new HttpError("Solo l'ADMIN gestisce gli utenti", 403);
};

/** Invito (ADMIN): utente "invited", token di 24 ore, mail d'invito nell'outbox. 409 se l'email esiste. */
export async function inviteUser(deps: StoreDeps, actor: Actor, input: UserInviteRequest, operationId?: string): Promise<UserDTO> {
  requireAdmin(actor);
  assertMembershipsCoherent(input.memberships);
  assertDirezioneAllowed(input.direzione);
  if (!input.isAdmin && !input.direzione && input.memberships.length === 0) throw new HttpError("Serve almeno un'appartenenza", 422);
  const email = normEmail(input.email);
  const { result } = await runOperation(deps.client, deps.db, { actorId: actor.id, operationId, request: { invite: input } }, async (ctx) => {
    if (await store.users(ctx.db).findOne({ email }, { session: ctx.session })) throw new HttpError("Esiste già un utente con questa email", 409);
    const doc: StoreUserDoc = {
      _id: new ObjectId(),
      email,
      name: input.name.trim(),
      passwordHash: null,
      status: "invited",
      isAdmin: !!input.isAdmin,
      ...(input.direzione ? { direzione: true as const } : {}),
      memberships: input.memberships,
      authVersion: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    await store.users(ctx.db).insertOne(doc, { session: ctx.session });
    const token = await createToken(ctx, doc._id, "invite");
    const link = `${baseUrl()}/set-password?token=${token}`;
    const tpl = invitationEmail(doc.name, link);
    await enqueueDeliveries(ctx, [{ eventKey: `invite:${doc._id.toHexString()}`, userId: doc._id, payload: { to: email, subject: tpl.subject, html: tpl.html, actionLink: link } }]);
    return toUserDTO(doc);
  });
  return result;
}

/**
 * Modifica (ADMIN): nome, stato, isAdmin, appartenenze (sostituiscono l'elenco). authVersion cresce se
 * cambiano stato, ADMIN o appartenenze. 422 se un gestore attivo resterebbe senza PM leader (D-101).
 */
export async function updateUser(deps: StoreDeps, actor: Actor, id: string, input: UserUpdateRequest, operationId?: string): Promise<UserDTO> {
  requireAdmin(actor);
  if (!ObjectId.isValid(id)) throw new HttpError("Utente non trovato", 404);
  if (input.memberships) assertMembershipsCoherent(input.memberships);
  assertDirezioneAllowed(input.direzione);
  const { result } = await runOperation(deps.client, deps.db, { actorId: actor.id, operationId, request: { update: id, input } }, async (ctx) => {
    const before = await store.users(ctx.db).findOne({ _id: new ObjectId(id) }, { session: ctx.session });
    if (!before) throw new HttpError("Utente non trovato", 404);
    const after = {
      name: input.name?.trim() ?? before.name,
      status: input.status ?? before.status,
      isAdmin: input.isAdmin ?? before.isAdmin,
      memberships: input.memberships ?? before.memberships,
    };
    // §15.2: con l'interruttore spento il campo resta com'è nel database e non dà permessi; vale però per il controllo
    // delle appartenenze, così un utente «Direzione pura» resta modificabile e disattivabile anche a interruttore spento.
    const direzioneBefore = before.direzione === true;
    const direzioneAfter = input.direzione ?? direzioneBefore;
    if (!after.isAdmin && !direzioneAfter && after.memberships.length === 0 && after.status !== "deactivated") throw new HttpError("Serve almeno un'appartenenza", 422);
    await assertPmLeadersKept(ctx, before, after);
    await assertAdminKept(ctx, before, after);
    const authChanged =
      after.status !== before.status ||
      after.isAdmin !== before.isAdmin ||
      direzioneAfter !== direzioneBefore ||
      JSON.stringify(after.memberships) !== JSON.stringify(before.memberships);
    const updated = await store.users(ctx.db).findOneAndUpdate(
      { _id: before._id },
      {
        $set: { ...after, ...(direzioneAfter ? { direzione: true as const } : {}), updatedAt: ctx.now },
        ...(direzioneAfter ? {} : { $unset: { direzione: "" } }),
        ...(authChanged ? { $inc: { authVersion: 1 } } : {}),
      },
      { session: ctx.session, returnDocument: "after" }
    );
    return toUserDTO(updated!);
  });
  return result;
}

/** Imposta la password da un token d'invito o di reset e attiva l'account. */
export async function setPasswordWithToken(deps: StoreDeps, token: string, password: string, type: "invite" | "reset"): Promise<{ email: string }> {
  const hash = await hashPassword(password);
  const { result } = await runOperation(deps.client, deps.db, { actorId: `token:${type}`, request: { token: crypto.createHash("sha256").update(token).digest("hex") } }, async (ctx) => {
    const t = await store.authTokens(ctx.db).findOne({ token, type }, { session: ctx.session });
    if (!t || t.usedAt || t.expiresAt.getTime() < ctx.now.getTime()) throw new HttpError("Il link non è valido o è scaduto", 400);
    const user = await store.users(ctx.db).findOne({ _id: t.userId }, { session: ctx.session });
    if (!user || user.status === "deactivated") throw new HttpError("Account non trovato", 404);
    // Una password scelta dall'utente (invito o reset) chiude anche il cambio obbligatorio (D-173).
    await store.users(ctx.db).updateOne(
      { _id: user._id },
      { $set: { passwordHash: hash, status: "active", updatedAt: ctx.now }, $unset: { mustChangePassword: "" } },
      { session: ctx.session }
    );
    await store.authTokens(ctx.db).updateOne({ _id: t._id }, { $set: { usedAt: ctx.now } }, { session: ctx.session });
    if (type === "invite") {
      const link = `${baseUrl()}/login`;
      const tpl = welcomeEmail(user.name, link);
      await enqueueDeliveries(ctx, [{ eventKey: `welcome:${user._id.toHexString()}`, userId: user._id, payload: { to: user.email, subject: tpl.subject, html: tpl.html, actionLink: link } }]);
    }
    return { email: user.email };
  });
  return result;
}

/** Reset: risponde sempre ok per non rivelare quali email esistono. */
export async function requestPasswordReset(deps: StoreDeps, email: string): Promise<{ ok: true }> {
  const user = await store.users(deps.db).findOne({ email: normEmail(email) });
  if (!user || user.status === "deactivated") return { ok: true };
  await runOperation(deps.client, deps.db, { actorId: `reset:${user._id.toHexString()}`, request: { reset: Date.now() } }, async (ctx) => {
    const token = await createToken(ctx, user._id, "reset");
    const link = `${baseUrl()}/reset-password?token=${token}`;
    const tpl = resetPasswordEmail(user.name, link);
    await enqueueDeliveries(ctx, [{ eventKey: `reset:${token.slice(0, 16)}`, userId: user._id, payload: { to: user.email, subject: tpl.subject, html: tpl.html, actionLink: link } }]);
    return null;
  });
  return { ok: true };
}

/** 404 se l'account non c'è o non è attivo; 400 se la password attuale è errata. Toglie il cambio obbligatorio (D-173). */
export async function changePassword(deps: StoreDeps, userId: string, current: string, next: string): Promise<{ ok: true }> {
  if (!ObjectId.isValid(userId)) throw new HttpError("Account non trovato", 404);
  const user = await store.users(deps.db).findOne({ _id: new ObjectId(userId) });
  if (!user || user.status !== "active" || !user.passwordHash) throw new HttpError("Account non trovato", 404);
  if (!(await verifyPassword(current, user.passwordHash))) throw new HttpError("Password attuale errata", 400);
  await store.users(deps.db).updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(next), updatedAt: new Date() }, $unset: { mustChangePassword: "" } }
  );
  return { ok: true };
}

/**
 * Nuovo invio dell'invito (ADMIN, v0.1.11, D-108): solo per utenti "invited" (altrimenti 409). I token d'invito
 * ancora validi si annullano; nuovo token e nuova mail nell'outbox.
 */
export async function resendInvite(deps: StoreDeps, actor: Actor, id: string, operationId?: string): Promise<UserDTO> {
  requireAdmin(actor);
  if (!ObjectId.isValid(id)) throw new HttpError("Utente non trovato", 404);
  const { result } = await runOperation(deps.client, deps.db, { actorId: actor.id, operationId, request: { resendInvite: id } }, async (ctx) => {
    const user = await store.users(ctx.db).findOne({ _id: new ObjectId(id) }, { session: ctx.session });
    if (!user) throw new HttpError("Utente non trovato", 404);
    if (user.status !== "invited") throw new HttpError("L'utente ha già attivato l'account: non serve un nuovo invito", 409);
    await store.authTokens(ctx.db).updateMany(
      { userId: user._id, type: "invite", usedAt: null },
      { $set: { usedAt: ctx.now } },
      { session: ctx.session }
    );
    const token = await createToken(ctx, user._id, "invite");
    const link = `${baseUrl()}/set-password?token=${token}`;
    const tpl = invitationEmail(user.name, link);
    await enqueueDeliveries(ctx, [
      { eventKey: `invite:${user._id.toHexString()}:${ctx.operationId}`, userId: user._id, payload: { to: user.email, subject: tpl.subject, html: tpl.html, actionLink: link } },
    ]);
    return toUserDTO(user);
  });
  return result;
}
