import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAssignable } from "@/components/scheda/lists-source";

afterEach(() => vi.unstubAllGlobals());

describe("loadAssignable (D-39)", () => {
  it("reads GET /api/users/assignable and turns users into options (id as code)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ id: "u7", name: "Anna Neri" }]), { status: 200, headers: { "content-type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadAssignable("INWIT", "PM")).toEqual([{ code: "u7", label: "Anna Neri" }]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/users/assignable?templateId=INWIT&role=PM");
  });
});
