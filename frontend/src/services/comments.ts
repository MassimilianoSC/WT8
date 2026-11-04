/**
 * Commenti con menzioni (contratto §14, D-183, D-184, D-185).
 *
 * - Testo semplice, mai interpretato (D-184): si salva e si restituisce com'è, dopo il trim; nessun HTML.
 * - Li legge chi vede la pratica (D-185); pratica non visibile = 404 come inesistente. Scrive chi vede la pratica, anche
 *   se il suo gruppo non è abilitato, solo sull'iterazione corrente di una pratica non archiviata (409 ARCHIVED /
 *   PAST_ITERATION). L'autore modifica; autore o ADMIN elimina (logica: le risposte restano).
 * - Menzioni strutturate ricontrollate dal server (etichette ricalcolate): gruppo = utenti attivi del gruppo sul cliente,
 *   tutti = utenti attivi con un'appartenenza sul cliente, persona = utente attivo che vede la pratica (altrimenti 422).
 *   Notifica MENTION e mail SENZA testo a ogni destinatario, mai all'autore; in una modifica solo ai nuovi.
 * - Scritture in transazione con ricevuta (operationId); eventi COMMENT_* nello storico senza testo. Separati dalla
 *   revisione della pratica: non entrano in conflitto con il salvataggio dei campi.
 */
import { ObjectId, type Db } from "mongodb";
import {
  GROUP_IDS,
  type CommentCreateRequest,
  type CommentDTO,
  type CommentListResponse,
  type CommentMention,
  type CommentUpdateRequest,
  type GroupId,
  type MentionableDTO,
  type UserDTO,
} from "@/lib/contract";
import { appBaseUrl, mentionEmail } from "@/lib/email";
import { canSeePractice } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { GROUP_LABELS } from "@/lib/practice/labels";
import { store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { runOperation, type OperationContext } from "@/lib/store/transaction";
import type { NotificationDoc, PracticeCommentDoc, PracticeDoc, StoredMention, StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { loadVisiblePractice, parsePracticeId } from "@/services/practices-v2/repository";
import type { StoreDeps } from "@/services/users-v2";

const MAX_REVISIONS = 20;
const ALL_LABEL = "@tutti";
const groupLabel = (g: GroupId) => `@${GROUP_LABELS[g]}`;

const notFoundComment = () => new HttpError("Commento non trovato", 404);
const parseCommentId = (id: string) => {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw notFoundComment();
  return new ObjectId(id);
};

/** Motivo per cui sull'iterazione `n` non si scrive (null = si scrive). */
function writeBlock(p: PracticeDoc, n: number): "ARCHIVED" | "PAST_ITERATION" | null {
  if (p.archived) return "ARCHIVED";
  if (n !== p.currentIterationN) return "PAST_ITERATION";
  return null;
}
const assertWritable = (p: PracticeDoc, n: number) => {
  const block = writeBlock(p, n);
  if (block === "ARCHIVED") throw new HttpError("Pratica archiviata: i commenti sono in sola lettura", 409, { code: "ARCHIVED" });
  if (block === "PAST_ITERATION") throw new HttpError("Iterazione passata: i commenti sono in sola lettura", 409, { code: "PAST_ITERATION" });
};

/* ---------- menzioni ---------- */

const mentionKey = (m: { kind: string; id?: unknown }) => `${m.kind}:${m.id ? String(m.id) : ""}`;

/**
 * Ricontrolla le menzioni del client: tipi e id validi, persone attive che vedono la pratica (altrimenti 422). Le
 * etichette le calcola il server; i doppioni si tolgono.
 */
async function resolveMentions(ctx: Pick<OperationContext, "db" | "session">, practice: PracticeDoc, input: CommentMention[]): Promise<StoredMention[]> {
  const out = new Map<string, StoredMention>();
  const userIds = input.filter((m) => m.kind === "user").map((m) => (m as { id: string }).id);
  const users = userIds.length
    ? await store.users(ctx.db).find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } }, { session: ctx.session, projection: { name: 1, status: 1, isAdmin: 1, memberships: 1 } }).toArray()
    : [];
  const byId = new Map(users.map((u) => [u._id.toHexString(), u]));
  for (const m of input) {
    if (m.kind === "group") out.set(mentionKey(m), { kind: "group", id: m.id, label: groupLabel(m.id) });
    else if (m.kind === "all") out.set(mentionKey(m), { kind: "all", label: ALL_LABEL });
    else {
      const u = byId.get(m.id);
      if (!u || u.status !== "active" || !canSeePractice({ id: u._id.toHexString(), isAdmin: u.isAdmin, status: u.status, memberships: u.memberships }, practice)) {
        throw new HttpError("Menzione non valida: la persona non è attiva o non vede la pratica", 422);
      }
      out.set(mentionKey(m), { kind: "user", id: u._id, label: `@${u.name}` });
    }
  }
  return [...out.values()];
}

/** Destinatari delle menzioni: utenti attivi che vedono la pratica, mai l'autore. */
async function recipientsOf(ctx: Pick<OperationContext, "db" | "session">, practice: PracticeDoc, mentions: StoredMention[], authorId: ObjectId): Promise<StoreUserDoc[]> {
  const or: object[] = [];
  const groups = mentions.filter((m) => m.kind === "group").map((m) => (m as { id: GroupId }).id);
  if (mentions.some((m) => m.kind === "all")) or.push({ "memberships.templateId": practice.templateId });
  if (groups.length) or.push({ memberships: { $elemMatch: { templateId: practice.templateId, group: { $in: groups } } } });
  const people = mentions.filter((m) => m.kind === "user").map((m) => (m as { id: ObjectId }).id);
  if (people.length) or.push({ _id: { $in: people } });
  if (!or.length) return [];
  const users = await store.users(ctx.db).find({ $or: or, status: "active", _id: { $ne: authorId } }, { session: ctx.session }).toArray();
  return users.filter((u) => canSeePractice({ id: u._id.toHexString(), isAdmin: u.isAdmin, status: u.status, memberships: u.memberships }, practice));
}

/** Notifica MENTION e mail senza testo (D-185), una per destinatario e commento. */
async function notifyMentions(ctx: OperationContext, practice: PracticeDoc, comment: PracticeCommentDoc, recipients: StoreUserDoc[], actorName: string) {
  if (!recipients.length) return;
  const s = practice.currentSummary;
  const gestore = COMPILED_TEMPLATES[practice.templateId].template.label;
  const id = practice._id.toHexString();
  const link = `${appBaseUrl()}/pratiche/${id}?iterazione=${comment.n}&commento=${comment._id.toHexString()}`;
  for (const u of recipients) {
    const eventKey = `mention:${comment._id.toHexString()}:${u._id.toHexString()}`;
    const doc: Omit<NotificationDoc, "_id"> = {
      userId: u._id,
      kind: "MENTION",
      eventKey,
      title: `${actorName} ti ha menzionato su ${s.codiceSito}`,
      body: `${actorName} ti ha menzionato in un commento sulla pratica ${s.codiceSito} – ${s.nomeSito} (${gestore})`,
      link: { practiceId: practice._id, iteration: comment.n, commentId: comment._id },
      createdAt: ctx.now,
      readAt: null,
    };
    await store.notifications(ctx.db).updateOne({ userId: u._id, eventKey }, { $setOnInsert: { _id: new ObjectId(), ...doc } }, { upsert: true, session: ctx.session });
    const mail = mentionEmail({ name: u.name, actorName, codiceSito: s.codiceSito, nomeSito: s.nomeSito, gestore, link });
    await enqueueDeliveries(ctx, [{ eventKey, userId: u._id, payload: { to: u.email, subject: mail.subject, html: mail.html, actionLink: link } }]);
  }
}

/* ---------- DTO ---------- */

function toMentionDTO(m: StoredMention): CommentMention {
  if (m.kind === "user") return { kind: "user", id: m.id.toHexString(), label: m.label };
  return m;
}

function toCommentDTO(c: PracticeCommentDoc, user: UserDTO, practice: PracticeDoc): CommentDTO {
  const writable = writeBlock(practice, c.n) === null;
  const mine = c.authorId.toHexString() === user.id;
  const deleted = c.deletedAt !== null;
  return {
    id: c._id.toHexString(),
    practiceId: c.practiceId.toHexString(),
    iteration: c.n,
    parentId: c.parentId ? c.parentId.toHexString() : null,
    author: { id: c.authorId.toHexString(), name: c.authorName },
    body: deleted ? "" : c.body,
    mentions: deleted ? [] : c.mentions.map(toMentionDTO),
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    deleted,
    ...(deleted && c.deletedByName ? { deletedByName: c.deletedByName } : {}),
    canEdit: !deleted && writable && mine,
    canDelete: !deleted && writable && (mine || user.isAdmin),
    replies: [],
  };
}

/* ---------- lettura ---------- */

export function parseCommentQuery(params: URLSearchParams): { iteration?: number; all: boolean } {
  const raw = params.get("iteration");
  const iteration = raw === null || raw === "" ? undefined : Number(raw);
  if (iteration !== undefined && (!Number.isInteger(iteration) || iteration < 1)) throw new HttpError("Parametro iteration non valido", 400);
  const all = params.get("all");
  return { iteration, all: all === "1" || all === "true" };
}

export async function listComments(db: Db, user: UserDTO, practiceId: string, q: { iteration?: number; all?: boolean } = {}): Promise<CommentListResponse> {
  const practice = await loadVisiblePractice(db, user, parsePracticeId(practiceId));
  const n = q.iteration ?? practice.currentIterationN;
  const docs = await store.practiceComments(db)
    .find({ practiceId: practice._id, ...(q.all ? {} : { n }) })
    .sort({ n: 1, createdAt: 1, _id: 1 })
    .toArray();
  const roots: CommentDTO[] = [];
  const byId = new Map<string, CommentDTO>();
  for (const d of docs) {
    const dto = toCommentDTO(d, user, practice);
    byId.set(dto.id, dto);
    const parent = dto.parentId ? byId.get(dto.parentId) : undefined;
    if (parent) parent.replies.push(dto);
    else roots.push(dto);
  }
  const block = writeBlock(practice, n);
  return { items: roots, canComment: block === null, ...(block ? { reason: block } : {}) };
}

async function readComment(db: Db, user: UserDTO, id: ObjectId): Promise<CommentDTO> {
  const c = await store.practiceComments(db).findOne({ _id: id });
  if (!c) throw notFoundComment();
  const practice = await loadVisiblePractice(db, user, c.practiceId);
  const dto = toCommentDTO(c, user, practice);
  if (!c.parentId) {
    const replies = await store.practiceComments(db).find({ parentId: c._id }).sort({ createdAt: 1, _id: 1 }).toArray();
    dto.replies = replies.map((r) => toCommentDTO(r, user, practice));
  }
  return dto;
}

/** Candidati per il menu "@": i quattro gruppi, "tutti" e le persone attive che vedono la pratica (senza email, senza sé). */
export async function mentionable(db: Db, user: UserDTO, practiceId: string): Promise<MentionableDTO> {
  const practice = await loadVisiblePractice(db, user, parsePracticeId(practiceId));
  const users = await store.users(db)
    .find({ status: "active", $or: [{ "memberships.templateId": practice.templateId }, { isAdmin: true }], _id: { $ne: new ObjectId(user.id) } }, { projection: { name: 1, status: 1, isAdmin: 1, memberships: 1 } })
    .sort({ name: 1, _id: 1 })
    .toArray();
  return {
    groups: GROUP_IDS.map((id) => ({ id, label: groupLabel(id) })),
    all: { label: ALL_LABEL },
    people: users
      .filter((u) => canSeePractice({ id: u._id.toHexString(), isAdmin: u.isAdmin, status: u.status, memberships: u.memberships }, practice))
      .map((u) => ({ id: u._id.toHexString(), name: u.name, groups: [...new Set(u.memberships.filter((m) => m.templateId === practice.templateId).map((m) => m.group))] })),
  };
}

/* ---------- scritture ---------- */

type Receipt = { commentId: string };

async function loadPracticeInTx(ctx: OperationContext, user: UserDTO, practiceId: ObjectId): Promise<PracticeDoc> {
  return loadVisiblePractice(ctx.db, user, practiceId, ctx.session);
}

export async function createComment(deps: StoreDeps & { clock?: () => Date }, user: UserDTO, practiceId: string, req: CommentCreateRequest): Promise<CommentDTO> {
  const pid = parsePracticeId(practiceId);
  const { result } = await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { comment: practiceId, body: req.body, mentions: req.mentions, parentId: req.parentId ?? null }, practiceId: pid, now: deps.clock?.() },
    async (ctx) => {
      const practice = await loadPracticeInTx(ctx, user, pid);
      assertWritable(practice, practice.currentIterationN);
      let parentId: ObjectId | null = null;
      if (req.parentId) {
        const parent = await store.practiceComments(ctx.db).findOne({ _id: parseCommentId(req.parentId), practiceId: pid }, { session: ctx.session });
        if (!parent) throw notFoundComment();
        assertWritable(practice, parent.n);
        parentId = parent.parentId ?? parent._id; // una risposta a una risposta va sotto il principale
      }
      const mentions = await resolveMentions(ctx, practice, req.mentions);
      const author = new ObjectId(user.id);
      const doc: PracticeCommentDoc = {
        _id: new ObjectId(),
        practiceId: pid,
        iterationId: practice.currentIterationId,
        n: practice.currentIterationN,
        parentId,
        authorId: author,
        authorName: user.name,
        body: req.body,
        mentions,
        createdAt: ctx.now,
        editedAt: null,
        revisions: [],
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
      };
      await store.practiceComments(ctx.db).insertOne(doc, { session: ctx.session });
      const log = new OpLog(ctx, { id: author, name: user.name });
      log.event({ practiceId: pid, iterationId: doc.iterationId, n: doc.n }, { kind: "COMMENT_ADD", detail: `Commento di ${user.name}` });
      await log.flush();
      await notifyMentions(ctx, practice, doc, await recipientsOf(ctx, practice, mentions, author), user.name);
      return { commentId: doc._id.toHexString() };
    }
  );
  return readComment(deps.db, user, new ObjectId(result.commentId));
}

export async function updateComment(deps: StoreDeps & { clock?: () => Date }, user: UserDTO, practiceId: string, commentId: string, req: CommentUpdateRequest): Promise<CommentDTO> {
  const pid = parsePracticeId(practiceId);
  const cid = parseCommentId(commentId);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { commentEdit: commentId, body: req.body, mentions: req.mentions }, practiceId: pid, now: deps.clock?.() },
    async (ctx) => {
      const practice = await loadPracticeInTx(ctx, user, pid);
      const c = await store.practiceComments(ctx.db).findOne({ _id: cid, practiceId: pid }, { session: ctx.session });
      if (!c) throw notFoundComment();
      if (c.authorId.toHexString() !== user.id) throw new HttpError("Solo l'autore modifica il commento", 403);
      if (c.deletedAt) throw new HttpError("Il commento è stato eliminato", 409, { code: "DELETED" });
      assertWritable(practice, c.n);
      const mentions = await resolveMentions(ctx, practice, req.mentions);
      const same = c.body === req.body && JSON.stringify(c.mentions.map(mentionKey).sort()) === JSON.stringify(mentions.map(mentionKey).sort());
      if (same) return { commentId };
      const revisions = [...c.revisions, { body: c.body, mentions: c.mentions, at: c.editedAt ?? c.createdAt }].slice(-MAX_REVISIONS);
      await store.practiceComments(ctx.db).updateOne({ _id: cid }, { $set: { body: req.body, mentions, editedAt: ctx.now, revisions } }, { session: ctx.session });
      const author = new ObjectId(user.id);
      const log = new OpLog(ctx, { id: author, name: user.name });
      log.event({ practiceId: pid, iterationId: c.iterationId, n: c.n }, { kind: "COMMENT_EDIT", detail: `Commento di ${user.name} modificato` });
      await log.flush();
      // Solo chi non era già destinatario prima della modifica.
      const before = new Set((await recipientsOf(ctx, practice, c.mentions, author)).map((u) => u._id.toHexString()));
      const fresh = (await recipientsOf(ctx, practice, mentions, author)).filter((u) => !before.has(u._id.toHexString()));
      await notifyMentions(ctx, practice, { ...c, mentions }, fresh, user.name);
      return { commentId };
    }
  );
  return readComment(deps.db, user, cid);
}

export async function deleteComment(deps: StoreDeps & { clock?: () => Date }, user: UserDTO, practiceId: string, commentId: string, opts: { operationId?: string } = {}): Promise<void> {
  const pid = parsePracticeId(practiceId);
  const cid = parseCommentId(commentId);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: opts.operationId, request: { commentDelete: commentId }, practiceId: pid, now: deps.clock?.() },
    async (ctx) => {
      const practice = await loadPracticeInTx(ctx, user, pid);
      const c = await store.practiceComments(ctx.db).findOne({ _id: cid, practiceId: pid }, { session: ctx.session });
      if (!c) throw notFoundComment();
      const mine = c.authorId.toHexString() === user.id;
      if (!mine && !user.isAdmin) throw new HttpError("Solo l'autore o un ADMIN elimina il commento", 403);
      if (c.deletedAt) return { commentId }; // già eliminato: nessun effetto
      assertWritable(practice, c.n);
      await store.practiceComments(ctx.db).updateOne({ _id: cid }, { $set: { deletedAt: ctx.now, deletedBy: new ObjectId(user.id), deletedByName: user.name } }, { session: ctx.session });
      const log = new OpLog(ctx, { id: new ObjectId(user.id), name: user.name });
      log.event({ practiceId: pid, iterationId: c.iterationId, n: c.n }, { kind: "COMMENT_DELETE", detail: `Commento di ${c.authorName} eliminato da ${user.name}` });
      await log.flush();
      if (!mine) {
        await store.auditLog(ctx.db).insertOne(
          {
            _id: new ObjectId(),
            kind: "COMMENT_DELETE",
            actorId: new ObjectId(user.id),
            actorName: user.name,
            at: ctx.now,
            operationId: ctx.operationId,
            comment: { id: c._id, practiceId: pid, authorId: c.authorId, authorName: c.authorName },
          },
          { session: ctx.session }
        );
      }
      return { commentId };
    }
  );
}
