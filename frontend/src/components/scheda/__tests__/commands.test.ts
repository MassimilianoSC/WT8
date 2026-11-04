import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client";
import { conflictOf, createPractice, newOperationId, resolveTemplate, runCommand } from "@/components/scheda/commands";
import { MOCK_DETAIL } from "@/components/scheda/mock-template";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify(MOCK_DETAIL), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const call = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe("conflictOf", () => {
  it("classifies 409s by code, defaulting to a revision conflict", () => {
    expect(conflictOf(new ApiError("x", 409, { error: "x", code: "ITERATION_CONFLICT" }))).toBe("ITERATION_CONFLICT");
    expect(conflictOf(new ApiError("x", 409, { error: "x", code: "OPERATION_REUSED" }))).toBe("OPERATION_REUSED");
    expect(conflictOf(new ApiError("x", 409, { error: "x" }))).toBe("REVISION_CONFLICT");
    expect(conflictOf(new ApiError("x", 403, { error: "x" }))).toBeNull();
    expect(conflictOf(new Error("rete"))).toBeNull();
  });

  it("creates distinct operation ids", () => {
    expect(newOperationId()).not.toBe(newOperationId());
  });
});

describe("runCommand (contract §5.3)", () => {
  const base = `/api/practices/${MOCK_DETAIL.id}`;

  it("sends the revision read and the operationId", async () => {
    await runCommand(MOCK_DETAIL, { kind: "assign", groups: ["AIE", "DL"], note: "n" }, "op-1");
    expect(call()).toEqual({ url: `${base}/assign`, method: "POST", body: { groups: ["AIE", "DL"], note: "n", revision: MOCK_DETAIL.revision, operationId: "op-1" } });
    await runCommand(MOCK_DETAIL, { kind: "stato", stato: "TERMINATO" }, "op-2");
    expect(call(1)).toEqual({ url: `${base}/stato`, method: "POST", body: { stato: "TERMINATO", revision: MOCK_DETAIL.revision, operationId: "op-2" } });
  });

  it("Rilavorazione does not send a revision (the origin does not change)", async () => {
    await runCommand(MOCK_DETAIL, { kind: "rework", codiceG7: "999" }, "op-3");
    expect(call()).toEqual({ url: `${base}/rework`, method: "POST", body: { codiceG7: "999", operationId: "op-3" } });
  });

  it("Cancella is a DELETE with revision and operationId in the query, resolving to null", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await runCommand(MOCK_DETAIL, { kind: "delete" }, "op-4")).toBeNull();
    expect(call()).toMatchObject({ url: `${base}?revision=${MOCK_DETAIL.revision}&operationId=op-4`, method: "DELETE" });
  });

  it("passes a 409 on as ApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Conflitto", code: "REVISION_CONFLICT" }), { status: 409, headers: { "content-type": "application/json" } }));
    const err = await runCommand(MOCK_DETAIL, { kind: "archive" }, "op-5").catch((e) => e);
    expect(conflictOf(err)).toBe("REVISION_CONFLICT");
  });
});

describe("creation", () => {
  it("resolves the template from Cliente Finale and Committente", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ templateId: "ILIAD", candidates: ["ILIAD"] }), { status: 200, headers: { "content-type": "application/json" } }));
    const req = { committente: { code: "TODOS" }, clienteFinale: { code: "WIND3" } };
    expect(await resolveTemplate(req)).toEqual({ templateId: "ILIAD", candidates: ["ILIAD"] });
    expect(call()).toEqual({ url: "/api/practices/resolve-template", method: "POST", body: req });
  });

  it("creates a practice with the mandatory fields and the operationId", async () => {
    const req = { templateId: "TOWERNET" as const, committente: { code: "TODOS" }, clienteFinale: { code: "TOWERNET" }, codiceG7: "123", codiceSito: "TO0001", nomeSito: "Torino Nord" };
    await createPractice(req, "op-6");
    expect(call()).toEqual({ url: "/api/practices", method: "POST", body: { ...req, operationId: "op-6" } });
  });
});
