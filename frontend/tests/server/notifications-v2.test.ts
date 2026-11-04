// @vitest-environment node
/**
 * Notifiche in-app del modello nuovo (contratto §8). Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/notifications-v2.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { NotificationDoc } from "@/lib/store/types";
import { listNotifications, markAllNotificationsRead, markNotificationRead, parseNotificationQuery } from "@/services/notifications-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

const userOf = (id: ObjectId): UserDTO => ({ id: id.toHexString(), name: "u", email: "u@x", status: "active", isAdmin: false, memberships: [], createdAt: "", updatedAt: "" });

describe("parametri", () => {
  it("unread e limit validi, 400 altrimenti", () => {
    expect(parseNotificationQuery(new URLSearchParams("unread=true&limit=10"))).toEqual({ unread: true, limit: 10 });
    expect(parseNotificationQuery(new URLSearchParams(""))).toEqual({ unread: undefined, limit: undefined });
    for (const bad of ["unread=si", "limit=0", "limit=201", "limit=2.5"]) expect(() => parseNotificationQuery(new URLSearchParams(bad)), bad).toThrow(expect.objectContaining({ status: 400 }));
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("notifiche sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_notif_${Date.now()}`;
  const a = new ObjectId();
  const b = new ObjectId();
  const practiceId = new ObjectId();
  const t0 = new Date("2026-10-08T07:00:00Z");
  const notif = (userId: ObjectId, i: number, read = false): NotificationDoc => ({
    _id: new ObjectId(),
    userId,
    kind: "ASSIGN",
    eventKey: `k:${i}`,
    title: `t${i}`,
    body: "b",
    link: { practiceId, iteration: 1, rowId: practiceId },
    createdAt: new Date(t0.getTime() + i * 1000),
    readAt: read ? t0 : null,
  });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    await store.notifications(db).insertMany([notif(a, 1), notif(a, 2, true), notif(a, 3), notif(b, 4)]);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("solo le proprie, dalla più recente, con il conteggio delle non lette e i link", async () => {
    const r = await listNotifications(db, userOf(a));
    expect(r.items.map((i) => i.title)).toEqual(["t3", "t2", "t1"]);
    expect(r.unread).toBe(2);
    expect(r.items[0]).toMatchObject({ read: false, kind: "ASSIGN", link: { practiceId: practiceId.toHexString(), iteration: 1, rowId: practiceId.toHexString() } });
    expect((await listNotifications(db, userOf(a), { unread: true })).items.map((i) => i.title)).toEqual(["t3", "t1"]);
    expect((await listNotifications(db, userOf(a), { limit: 1 })).items).toHaveLength(1);
  });

  it("lettura: idempotente; 404 per le notifiche altrui o inesistenti", async () => {
    const { items } = await listNotifications(db, userOf(a), { unread: true });
    const first = await markNotificationRead(db, userOf(a), items[0].id, new Date("2026-10-09T00:00:00Z"));
    expect(first.read).toBe(true);
    expect((await markNotificationRead(db, userOf(a), items[0].id)).read).toBe(true);
    expect((await store.notifications(db).findOne({ _id: new ObjectId(items[0].id) }))!.readAt).toEqual(new Date("2026-10-09T00:00:00Z"));
    const other = (await listNotifications(db, userOf(b))).items[0].id;
    await expect(markNotificationRead(db, userOf(a), other)).rejects.toMatchObject({ status: 404 });
    await expect(markNotificationRead(db, userOf(a), "x")).rejects.toMatchObject({ status: 404 });
  });

  it("segna tutte lette solo le proprie", async () => {
    const r = await markAllNotificationsRead(db, userOf(a));
    expect(r.unread).toBe(0);
    expect((await listNotifications(db, userOf(b))).unread).toBe(1);
  });
});
