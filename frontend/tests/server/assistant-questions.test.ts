// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_IDS } from "@/lib/contract";
import { SEED_USERS, seedId } from "@/lib/store/seed-demo";

/**
 * Shape of the assistant's test questions (PROGETTO_ASSISTENTE_AI_v1 §13.2,
 * §13.5): only the file is checked here, not the answers. The ids must be
 * the seed's (seedId), the users must exist in the seed.
 */

const FRONTEND = path.resolve(__dirname, "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(FRONTEND, "tests/fixtures/assistant-questions.json"), "utf8")) as {
  version: number;
  clock: { seedNow: string; questionAt: string; timezone: string };
  practices: Record<string, { key: string; practiceId: string; codiceSito: string; nomeSito: string; templateId: string }>;
  eNotes: Record<string, string>;
  cases: Array<{
    id: string;
    family: string;
    dataset: string;
    user: { key: string; userId: string; role: string };
    question: string;
    context: Record<string, unknown> | null;
    oracle: Record<string, unknown>;
    oracleText: string;
    oracleFrom: string;
    verifiedOnSeed: boolean;
    setup?: string[];
  }>;
};

const ANSWER_STATES = ["ANSWER", "NO_DATA", "INSUFFICIENT_EVIDENCE", "PARTIAL", "CLARIFY", "OUT_OF_SCOPE"];
const ERROR_CODES = [
  "UNAUTHENTICATED", "AUTH_CHANGED", "NOT_ENABLED", "ORIGIN_DENIED", "NOT_FOUND", "CONVERSATION_NOT_FOUND", "BUSY_USER",
  "CONVERSATION_EXPIRED", "DATA_CHANGED", "BODY_TOO_LARGE", "INVALID_REQUEST", "QUERY_TOO_BROAD", "QUOTA_USER_MINUTE",
  "QUOTA_USER_DAY", "BUSY", "PROVIDER_QUOTA", "UNAVAILABLE", "TIMEOUT", "BLOCKED", "INTERNAL",
];
const PRACTICE_REFS = ["practices", "candidates"];
const KEY_REFS = ["forbiddenPractices"];

describe("assistant test questions (fixture)", () => {
  it("has the 34 S0 cases, 14 permission and 10 injection cases, ids unique and in order", () => {
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pad = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual([...pad("S", 34), ...pad("P", 14), ...pad("I", 10)]);
    expect(fixture.cases.filter((c) => c.family === "S0").every((c) => c.dataset === "S0")).toBe(true);
    expect(fixture.clock).toEqual({ seedNow: "2026-10-01T08:00:00Z", questionAt: "2026-10-09T08:00:00Z", timezone: "Europe/Rome" });
  });

  it("practice ids are the seed's", () => {
    for (const [key, p] of Object.entries(fixture.practices)) {
      expect(p.key).toBe(key);
      expect(p.practiceId, key).toBe(seedId(`practice:${key}`).toHexString());
      expect(TEMPLATE_IDS as readonly string[]).toContain(p.templateId);
    }
  });

  it("every case is well formed", () => {
    const users = new Map(SEED_USERS.map((u) => [u.key, u]));
    for (const c of fixture.cases) {
      const at = c.id;
      expect(["S0", "PERMISSIONS", "INJECTION"], at).toContain(c.family);
      expect(["S0", "E"], at).toContain(c.dataset);
      expect(users.has(c.user.key), `${at}: user ${c.user.key} not in the seed`).toBe(true);
      expect(c.user.userId, at).toBe(seedId(`user:${c.user.key}`).toHexString());
      expect(c.question.trim().length, at).toBeGreaterThan(0);
      expect(c.question.length, at).toBeLessThanOrEqual(2000);
      expect(c.oracleText.trim(), at).not.toBe("");
      expect(c.oracleFrom, at).toMatch(/^PROGETTO_ASSISTENTE_AI_v1 §13\.[25] [SPI]\d{2}$/);
      expect(typeof c.verifiedOnSeed, at).toBe("boolean");
      // Fixture E is o2's: its cases are not verified here.
      if (c.dataset === "E") expect(c.verifiedOnSeed, at).toBe(false);
      if (c.context !== null) expect(["list", "sheet", "stats", "other"], at).toContain(c.context.page);
      if (c.setup) expect(c.setup.every((s) => s.trim() !== ""), at).toBe(true);

      const o = c.oracle;
      const outcome = ["answerStates", "errorCode", "errorCodes", "denied"].filter((k) => k in o);
      // Injection cases may state only invariants (no write, no external fetch), always with their setup.
      if (outcome.length === 0) {
        expect(c.family, `${at}: no expected outcome`).toBe("INJECTION");
        expect(c.setup?.length ?? (o.mustNotMention ? 1 : 0), `${at}: invariants without setup`).toBeGreaterThan(0);
        expect(Object.keys(o).length, at).toBeGreaterThan(0);
      }
      if (Array.isArray(o.answerStates)) for (const s of o.answerStates) expect(ANSWER_STATES, at).toContain(s);
      if (typeof o.errorCode === "string") expect(ERROR_CODES, at).toContain(o.errorCode);
      if (Array.isArray(o.errorCodes)) for (const e of o.errorCodes) expect(ERROR_CODES, at).toContain(e);
      for (const ref of PRACTICE_REFS) {
        for (const p of (o[ref] as Array<{ key: string; practiceId: string }> | undefined) ?? []) {
          expect(fixture.practices[p.key], `${at}: ${p.key}`).toBeDefined();
          expect(p.practiceId, at).toBe(fixture.practices[p.key].practiceId);
        }
      }
      for (const ref of KEY_REFS) for (const k of (o[ref] as string[] | undefined) ?? []) expect(fixture.practices[k], `${at}: ${k}`).toBeDefined();
      if (typeof o.total === "number" && Array.isArray(o.practices)) expect(o.total, at).toBe(o.practices.length);
    }
  });

  it("cases that need setup or a simulated provider say so", () => {
    const needSetup = ["P05", "P08", "P10", "P11", "P12", "I01", "I02", "I03", "I05", "I06", "I07", "I08", "I09", "I10"];
    for (const id of needSetup) expect(fixture.cases.find((c) => c.id === id)?.setup?.length, id).toBeGreaterThan(0);
  });

  it("canaries of fixture E are never expected in an answer", () => {
    const canaries = [fixture.eNotes.AIE, fixture.eNotes.DL];
    for (const c of fixture.cases) {
      for (const m of (c.oracle.mustMention as string[] | undefined) ?? []) expect(canaries, c.id).not.toContain(m);
    }
  });
});
