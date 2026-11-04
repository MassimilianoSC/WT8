// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http-error";
import { TEMPLATE_IDS } from "@/lib/contract";
import { getTemplate, getTemplateBindings, listTemplates } from "@/services/templates";

describe("servizio template (GET /api/templates)", () => {
  it("elenca i sei template nell'ordine dei gestori", () => {
    const list = listTemplates();
    expect(list.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
    expect(list.find((t) => t.id === "TIM_FIBERCOP")).toEqual({ id: "TIM_FIBERCOP", label: "TIM / FIBERCOP", baseline: "2026-10-08" });
  });

  it("restituisce il TemplateDTO senza i collegamenti interni, senza database", async () => {
    const noDb = () => Promise.reject(new Error("il database non va toccato"));
    const t = await getTemplate("INWIT", null, noDb);
    expect(t.id).toBe("INWIT");
    expect(t.version).toMatch(/^2026-10-08\.[0-9a-f]{12}$/);
    expect(t.occurrences.length).toBe(145);
    expect(Object.keys(t)).not.toContain("bindings");
    expect(await getTemplate("INWIT", t.version, noDb)).toBe(t);
  });

  it("404 per template sconosciuto o versione archiviata assente", async () => {
    await expect(getTemplate("XYZ")).rejects.toBeInstanceOf(HttpError);
    const emptyDb = async () => ({ collection: () => ({ findOne: async () => null }) }) as never;
    await expect(getTemplate("ILIAD", "2020-01-01.000000000000", emptyDb)).rejects.toMatchObject({ status: 404 });
  });

  it("collegamenti per i motori disponibili lato server", () => {
    expect(getTemplateBindings("TOWERNET").computed.map((c) => c.formula).sort()).toEqual([
      "FORECAST_GEOLOGICA",
      "FORECAST_OTTENIMENTO_PERMESSI",
      "TIPOLOGIA_ATTIVITA_PE",
    ]);
  });
});
