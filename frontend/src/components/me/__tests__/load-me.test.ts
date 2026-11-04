import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ email: "pm@x.it" as string | null, user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth-v2", () => ({
  getSessionEmail: async () => auth.email,
  getCurrentUser: async () => auth.user,
}));
vi.mock("@/lib/store/db", () => ({ getStoreDb: async () => ({}) }));
const status = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/services/assistant/quota", () => ({ assistantStatus: (...a: unknown[]) => status.fn(...a) }));

import { loadMe } from "@/components/me/load-me";

const USER = {
  id: "u1", name: "PM", email: "pm@x.it", status: "active", isAdmin: false, mustChangePassword: false,
  memberships: [{ templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: false }],
  createdAt: "2026-10-01T09:00:00+02:00", updatedAt: "2026-10-01T09:00:00+02:00",
};
const READY = { enabled: true, availability: "READY", dailyLimit: 30, usedToday: 0, remainingToday: 30, resetAt: "2026-10-10T22:00:00.000Z", perMinuteLimit: 4 };

beforeEach(() => {
  auth.email = "pm@x.it";
  auth.user = USER;
  status.fn.mockReset();
});

describe("loadMe and the assistant (contract §13.1)", () => {
  it("the layout's MeDTO carries assistant, as GET /api/me: 'Chiedi' shows", async () => {
    status.fn.mockResolvedValue(READY);
    const s = await loadMe();
    expect(s.status).toBe("ok");
    expect(s.status === "ok" && s.me.assistant).toEqual(READY);
  });

  it("assistant switched off on the server: no key, so no 'Chiedi'", async () => {
    status.fn.mockResolvedValue(null);
    const s = await loadMe();
    expect(s.status === "ok" && "assistant" in s.me).toBe(false);
  });

  it("an error of the assistant never blocks the page", async () => {
    status.fn.mockRejectedValue(new Error("db"));
    const s = await loadMe();
    expect(s.status).toBe("ok");
    expect(s.status === "ok" && "assistant" in s.me).toBe(false);
  });
});
