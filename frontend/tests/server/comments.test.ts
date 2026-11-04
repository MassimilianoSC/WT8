// @vitest-environment node
/**
 * Commenti con menzioni (contratto §14, D-183, D-184, D-185) sul seed S0, replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/comments.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { CommentMention, UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { createComment, deleteComment, listComments, mentionable, updateComment } from "@/services/comments";
import { getHistory } from "@/services/practices-v2/history";
import { toUserDTO } from "@/services/users-v2";
import { resetDatabase } from "../../scripts/db/reset-core";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { eIds, seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("commenti con menzioni", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_commenti_${Date.now()}`;
  const ILIAD = eIds.practice("ILIAD-1").toHexString();
  const user = async (k: string): Promise<UserDTO> => toUserDTO((await store.users(db).findOne({ _id: eIds.user(k) }))!);
  const deps = () => ({ client, db });
  const fail = async (p: Promise<unknown>) => {
    try {
      await p;
      return "OK";
    } catch (e) {
      return e instanceof HttpError ? `${e.status}${e.extra?.code ? ` ${e.extra.code}` : ""}` : String(e);
    }
  };
  const mentionsOf = async (userKey: string) => store.notifications(db).find({ userId: eIds.user(userKey), kind: "MENTION" }).toArray();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("permessi: pratica non visibile 404 (lettura, scrittura, menzionabili); chi vede la pratica scrive anche se il gruppo non è abilitato", async () => {
    const multi = await user("multi"); // nessuna appartenenza su TIM
    const tim = eIds.practice("TIM-1").toHexString();
    expect(await fail(listComments(db, multi, tim))).toBe("404");
    expect(await fail(createComment(deps(), multi, tim, { body: "x", mentions: [] }))).toBe("404");
    expect(await fail(mentionable(db, multi, tim))).toBe("404");
    // AIE: ILIAD-1 non ha AIE abilitato, ma l'AIE vede la pratica (scope all) e commenta.
    const aie = await user("aie");
    const c = await createComment(deps(), aie, ILIAD, { body: "Domanda da AIE", mentions: [] });
    expect(c).toMatchObject({ body: "Domanda da AIE", author: { name: "Demo AIE" }, iteration: 1, canEdit: true, canDelete: true, deleted: false });
  });

  it("archiviata → 409 ARCHIVED; iterazione passata in sola lettura (PAST_ITERATION)", async () => {
    const pm = await user("pm");
    const fv = eIds.practice("FV-1").toHexString();
    expect(await fail(createComment(deps(), pm, fv, { body: "x", mentions: [] }))).toBe("409 ARCHIVED");
    expect(await listComments(db, pm, fv)).toMatchObject({ canComment: false, reason: "ARCHIVED" });
    const inwit = eIds.practice("INWIT-1").toHexString();
    // Un commento "vecchio" sull'iterazione 1 (scritto prima della ripresentazione) resta in sola lettura.
    const oldId = new ObjectId();
    await store.practiceComments(db).insertOne({
      _id: oldId, practiceId: eIds.practice("INWIT-1"), iterationId: eIds.iteration("INWIT-1", 1), n: 1, parentId: null, authorId: eIds.user("pm"), authorName: "Demo PM",
      body: "Nota della prima iterazione", mentions: [], createdAt: new Date("2026-07-01T08:00:00Z"), editedAt: null, revisions: [], deletedAt: null, deletedBy: null, deletedByName: null,
    });
    const past = await listComments(db, pm, inwit, { iteration: 1 });
    expect(past).toMatchObject({ canComment: false, reason: "PAST_ITERATION", items: [{ id: oldId.toHexString(), canEdit: false, canDelete: false }] });
    expect(await fail(createComment(deps(), pm, inwit, { body: "risposta", mentions: [], parentId: oldId.toHexString() }))).toBe("409 PAST_ITERATION");
    expect(await fail(updateComment(deps(), pm, inwit, oldId.toHexString(), { body: "y", mentions: [] }))).toBe("409 PAST_ITERATION");
    expect((await listComments(db, pm, inwit)).canComment).toBe(true); // iterazione corrente
  });

  it("menzioni: gruppo, tutti e persona ricontrollati; persona che non vede la pratica → 422; etichette del server; mai l'autore", async () => {
    const ut = await user("ut");
    const outsider = new ObjectId();
    await store.users(db).insertOne({ _id: outsider, email: "fuori@prova.local", name: "Fuori Cliente", passwordHash: null, status: "active", isAdmin: false, memberships: [{ templateId: "TOWERNET", group: "DL", role: "DL", leader: false }], authVersion: 1, createdAt: new Date(), updatedAt: new Date() });
    const bad: CommentMention[] = [{ kind: "user", id: outsider.toHexString(), label: "Fuori" }];
    expect(await fail(createComment(deps(), ut, ILIAD, { body: "ciao", mentions: bad }))).toBe("422");
    expect(await store.practiceComments(db).countDocuments({ body: "ciao" })).toBe(0);

    const before = (await mentionsOf("ut")).length;
    const c = await createComment(deps(), ut, ILIAD, {
      body: "Serve la relazione",
      mentions: [
        { kind: "group", id: "UT_PE", label: "label inventata" },
        { kind: "user", id: eIds.user("pm").toHexString(), label: "X" },
        { kind: "group", id: "UT_PE", label: "doppione" },
      ],
    });
    expect(c.mentions).toEqual([
      { kind: "group", id: "UT_PE", label: "@UT/PE" },
      { kind: "user", id: eIds.user("pm").toHexString(), label: "@Demo PM" },
    ]);
    // Destinatari: gruppo UT_PE su ILIAD (ut.leader, ut, pe, multi), più pm; MAI l'autore (ut).
    expect((await mentionsOf("ut")).length).toBe(before);
    for (const k of ["ut.leader", "pe", "multi", "pm"]) {
      const n = (await mentionsOf(k)).find((x) => x.eventKey === `mention:${c.id}:${eIds.user(k).toHexString()}`);
      expect(n, k).toMatchObject({ title: "Demo UT ti ha menzionato su IL-TO-0001", link: { practiceId: eIds.practice("ILIAD-1"), iteration: 1, commentId: new ObjectId(c.id) } });
      expect(n!.body).not.toContain("Serve la relazione");
    }
    expect(await store.notifications(db).countDocuments({ eventKey: { $regex: `^mention:${c.id}:` } })).toBe(4);
    // Mail: una per destinatario, subito (non solo in orario lavorativo), senza il testo del commento.
    const mails = await store.outbox(db).find({ eventKey: { $regex: `^mention:${c.id}:` } }).toArray();
    expect(mails).toHaveLength(4);
    for (const m of mails) {
      expect(m.payload.html).not.toContain("Serve la relazione");
      expect(m.businessHoursOnly ?? false).toBe(false);
      expect(m.payload.actionLink).toMatch(new RegExp(`/pratiche/${ILIAD}\\?iterazione=1&commento=${c.id}$`));
    }
    // "tutti": tutti gli utenti attivi con un'appartenenza su ILIAD, non l'autore e non chi è fuori cliente.
    const pm = await user("pm");
    const all = await createComment(deps(), pm, ILIAD, { body: "Avviso a tutti", mentions: [{ kind: "all", label: "?" }] });
    const recipients = await store.notifications(db).find({ eventKey: { $regex: `^mention:${all.id}:` } }).toArray();
    expect(recipients.map((r) => r.userId.toHexString())).not.toContain(eIds.user("pm").toHexString());
    expect(recipients.map((r) => r.userId.toHexString())).not.toContain(outsider.toHexString());
    expect(recipients.length).toBe(10); // 11 utenti con appartenenze ILIAD (demo + multi) meno l'autore
  });

  it("utenti della prova di carico (testAccount o dominio prova.invalid): notifica nell'app sì, mail in coda no", async () => {
    const pm = await user("pm");
    const marked = (await store.users(db).findOne({ _id: eIds.user("pe") }))!;
    const domain = new ObjectId();
    await store.users(db).updateOne({ _id: marked._id }, { $set: { testAccount: true } });
    await store.users(db).insertOne({ ...marked, _id: domain, email: "carico99@prova.invalid", name: "Prova dominio" });
    await store.users(db).updateOne({ _id: domain }, { $unset: { testAccount: "" } });
    try {
      const ids = [marked._id, domain, eIds.user("dl")];
      const c = await createComment(deps(), pm, ILIAD, { body: "Prova di carico", mentions: ids.map((id) => ({ kind: "user" as const, id: id.toHexString(), label: "x" })) });
      for (const id of ids) expect(await store.notifications(db).countDocuments({ eventKey: `mention:${c.id}:${id.toHexString()}` })).toBe(1);
      const mails = await store.outbox(db).find({ eventKey: { $regex: `^mention:${c.id}:` } }).toArray();
      expect(mails.map((m) => m.userId.toHexString())).toEqual([eIds.user("dl").toHexString()]);
    } finally {
      await store.users(db).updateOne({ _id: marked._id }, { $unset: { testAccount: "" } });
      await store.users(db).deleteOne({ _id: domain });
    }
  });

  it("testo con markup trattato come testo; idempotenza con la stessa operationId; vuoto → 422 (dalla rotta)", async () => {
    const pe = await user("pe");
    const op = randomUUID();
    const body = '<b>grassetto</b> <script>alert("x")</script> [link](https://esterno.example)';
    const a = await createComment(deps(), pe, ILIAD, { body, mentions: [{ kind: "user", id: eIds.user("dl").toHexString(), label: "dl" }], operationId: op });
    const b = await createComment(deps(), pe, ILIAD, { body, mentions: [{ kind: "user", id: eIds.user("dl").toHexString(), label: "dl" }], operationId: op });
    expect(b.id).toBe(a.id);
    expect(a.body).toBe(body);
    expect(await store.practiceComments(db).countDocuments({ body })).toBe(1);
    expect(await store.notifications(db).countDocuments({ eventKey: `mention:${a.id}:${eIds.user("dl").toHexString()}` })).toBe(1);
    const { commentCreateRequestSchema } = await import("@/lib/validators");
    expect(commentCreateRequestSchema.safeParse({ body: "   ", mentions: [] }).success).toBe(false);
    expect(commentCreateRequestSchema.safeParse({ body: "x".repeat(10_001), mentions: [] }).success).toBe(false);
    expect(commentCreateRequestSchema.safeParse({ body: "x", mentions: Array.from({ length: 21 }, () => ({ kind: "all", label: "t" })) }).success).toBe(false);
  });

  it("modifica solo dell'autore, versioni salvate, notifica solo ai nuovi menzionati; eliminazione autore o ADMIN, logica", async () => {
    const pm = await user("pm");
    const ut = await user("ut");
    const admin = await user("admin");
    const c = await createComment(deps(), pm, ILIAD, { body: "Prima versione", mentions: [{ kind: "user", id: eIds.user("ut").toHexString(), label: "ut" }] });
    expect(await fail(updateComment(deps(), ut, ILIAD, c.id, { body: "dirottato", mentions: [] }))).toBe("403");
    const e = await updateComment(deps(), pm, ILIAD, c.id, {
      body: "Seconda versione",
      mentions: [{ kind: "user", id: eIds.user("ut").toHexString(), label: "ut" }, { kind: "user", id: eIds.user("aie").toHexString(), label: "aie" }],
    });
    expect(e).toMatchObject({ body: "Seconda versione", editedAt: expect.any(String) });
    const doc = (await store.practiceComments(db).findOne({ _id: new ObjectId(c.id) }))!;
    expect(doc.revisions).toMatchObject([{ body: "Prima versione" }]);
    expect(await store.notifications(db).countDocuments({ eventKey: `mention:${c.id}:${eIds.user("ut").toHexString()}` })).toBe(1); // non rinotificato
    expect(await store.notifications(db).countDocuments({ eventKey: `mention:${c.id}:${eIds.user("aie").toHexString()}` })).toBe(1); // nuovo

    const r = await createComment(deps(), ut, ILIAD, { body: "Risposta", mentions: [], parentId: c.id });
    const rr = await createComment(deps(), pm, ILIAD, { body: "Risposta alla risposta", mentions: [], parentId: r.id });
    expect(rr.parentId).toBe(c.id); // un solo livello
    expect(await fail(deleteComment(deps(), ut, ILIAD, c.id))).toBe("403");
    await deleteComment(deps(), admin, ILIAD, c.id);
    await deleteComment(deps(), admin, ILIAD, c.id); // già eliminato: nessun effetto
    const list = await listComments(db, pm, ILIAD);
    const root = list.items.find((x) => x.id === c.id)!;
    expect(root).toMatchObject({ deleted: true, body: "", mentions: [], deletedByName: "Demo Admin", canEdit: false, canDelete: false });
    expect(root.replies.map((x) => x.body)).toEqual(["Risposta", "Risposta alla risposta"]);
    expect(await store.auditLog(db).countDocuments({ kind: "COMMENT_DELETE", "comment.id": new ObjectId(c.id) })).toBe(1);
    expect(await fail(updateComment(deps(), pm, ILIAD, c.id, { body: "dopo", mentions: [] }))).toBe("409 DELETED");
  });

  it("storico: eventi COMMENT_* senza testo; menzionabili senza email; azzeramento \"solo pratiche\" li toglie", async () => {
    const pm = await user("pm");
    const h = await getHistory(db, pm, ILIAD, { view: "events" });
    const kinds = h.items.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["COMMENT_ADD", "COMMENT_EDIT", "COMMENT_DELETE"]));
    const texts = JSON.stringify(h.items);
    for (const t of ["Prima versione", "Seconda versione", "Serve la relazione", "grassetto"]) expect(texts).not.toContain(t);
    const m = await mentionable(db, pm, ILIAD);
    expect(m.groups.map((g) => g.label)).toEqual(["@PM/Permessi", "@UT/PE", "@AIE", "@DL"]);
    expect(m.all.label).toBe("@tutti");
    expect(JSON.stringify(m)).not.toMatch(/@demo\.practicehub\.local|email/);
    expect(m.people.map((p) => p.name)).not.toContain("Demo PM"); // non se stesso
    expect(m.people.find((p) => p.name === "Demo UT")?.groups).toEqual(["UT_PE"]);
    const before = await store.practiceComments(db).countDocuments();
    expect(before).toBeGreaterThan(0);
    const dry = await resetDatabase({ client, uri: URL_RS!, dbName: DB, practicesOnly: true, log: () => {} });
    expect(dry.before.practice_comments).toBe(before);
  });
});
