// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assignRequestSchema,
  createPracticeRequestSchema,
  fieldChangeRequestSchema,
  userInviteRequestSchema,
} from "@/lib/validators";

const OP = "3f2b8c1e-6a4d-4e2b-9c7a-1b2c3d4e5f60";

describe("schemi del contratto v0.1.7", () => {
  it("accetta tutte le forme di FieldChange", () => {
    const r = fieldChangeRequestSchema.safeParse({
      iteration: 1,
      revision: 7,
      operationId: OP,
      changes: [
        { occurrenceKey: "F010@PM_PERMESSI.CORE", flowId: "F010", value: { code: "RAW_LAND" } },
        { occurrenceKey: "F074@PM_PERMESSI.ITER_AUTORIZZATIVO", repeat: "INTEGRAZIONE", rowId: "r1", flowId: "F074", value: "nota" },
        { repeat: "TENANT", op: "ADD_ROW", clientRowKey: "k1", values: { F020: { code: "TIM" } } },
        { repeat: "ODA", op: "REMOVE_ROW", rowId: "r2" },
        { repeat: "VINCOLI", rowId: "r3", constraint: { stato: { code: "PRESENTE" } } },
        { transversal: "noteOperative", group: "UT_PE", value: "testo" },
        { transversal: "fatturabile", value: "SI" },
        { transversal: "fatturato", value: null },
        { occurrenceKey: "F021@PM_PERMESSI.DATI_SECONDARI", flowId: "F021", value: 45.07 },
      ],
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("rifiuta campi sconosciuti, flowId malformati e liste vuote", () => {
    const base = { iteration: 1, revision: 0 };
    expect(fieldChangeRequestSchema.safeParse({ ...base, changes: [] }).success).toBe(false);
    expect(fieldChangeRequestSchema.safeParse({ ...base, changes: [{ flowId: "F010", value: "x" }] }).success).toBe(false); // manca occurrenceKey
    expect(fieldChangeRequestSchema.safeParse({ ...base, changes: [{ occurrenceKey: "k", flowId: "10", value: "x" }] }).success).toBe(false);
    expect(fieldChangeRequestSchema.safeParse({ ...base, extra: 1, changes: [{ transversal: "fatturabile", value: "SI" }] }).success).toBe(false);
    expect(fieldChangeRequestSchema.safeParse({ ...base, operationId: "non-uuid", changes: [{ transversal: "fatturabile", value: "SI" }] }).success).toBe(false);
  });

  it("Codice G7 solo cifre (D-93)", () => {
    const body = { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceSito: "S1", nomeSito: "Sito" };
    expect(createPracticeRequestSchema.safeParse({ ...body, codiceG7: "123456" }).success).toBe(true);
    expect(createPracticeRequestSchema.safeParse({ ...body, codiceG7: "12A" }).success).toBe(false);
  });

  it("Assegna senza gruppi ripetuti", () => {
    expect(assignRequestSchema.safeParse({ revision: 1, groups: ["UT_PE", "AIE"] }).success).toBe(true);
    expect(assignRequestSchema.safeParse({ revision: 1, groups: ["UT_PE", "UT_PE"] }).success).toBe(false);
    expect(assignRequestSchema.safeParse({ revision: 1, groups: [] }).success).toBe(false);
  });

  it("appartenenze coerenti e almeno una se non ADMIN", () => {
    const m = { templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false };
    expect(userInviteRequestSchema.safeParse({ name: "A", email: "a@b.it", memberships: [m] }).success).toBe(true);
    expect(userInviteRequestSchema.safeParse({ name: "A", email: "a@b.it", memberships: [{ ...m, group: "AIE" }] }).success).toBe(false);
    expect(userInviteRequestSchema.safeParse({ name: "A", email: "a@b.it", memberships: [] }).success).toBe(false);
    expect(userInviteRequestSchema.safeParse({ name: "A", email: "a@b.it", isAdmin: true, memberships: [] }).success).toBe(true);
  });
});
