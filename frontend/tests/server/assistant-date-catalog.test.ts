// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GROUP_IDS, TEMPLATE_IDS } from "@/lib/contract";

/**
 * Semantic date catalog of the assistant (PROGETTO_ASSISTENTE_AI_v1 §4.3),
 * checked against the compiled templates on disk: every binding must exist,
 * be a DATE, sit in the declared section, group and repeat group, and carry
 * the template's exact label.
 */

const FRONTEND = path.resolve(__dirname, "../..");

interface Entry {
  semanticId: string;
  templateId: string;
  flowId: string;
  sectionKey: string;
  repeatGroup?: string;
  dateKind: "FORECAST" | "DEADLINE" | "RECORDED";
  completionFlowId?: string;
  businessGroup: string;
  ownerGroup: string;
  label: string;
  sourceDecision: string;
}

interface Occurrence {
  flowId: string | null;
  kind: "MASTER" | "MIRROR";
  dataType: string;
  sectionKey: string;
  ownerGroup: string;
  label: string;
}

interface Compiled {
  occurrences: Occurrence[];
  sections: Array<{ key: string; group: string }>;
  repeatGroups: Array<{ key: string; flowIds?: string[] }>;
}

const catalog = JSON.parse(fs.readFileSync(path.join(FRONTEND, "src/data/assistant-date-catalog.json"), "utf8")) as {
  version: number;
  entries: Entry[];
};
const templates = new Map<string, Compiled>(
  TEMPLATE_IDS.map((id) => [id, JSON.parse(fs.readFileSync(path.join(FRONTEND, `src/data/templates/${id}.json`), "utf8")).template])
);

function masterOf(t: Compiled, flowId: string): Occurrence | undefined {
  return t.occurrences.find((o) => o.flowId === flowId && o.kind === "MASTER");
}
function groupsShowing(t: Compiled, flowId: string): Set<string> {
  const groupOf = new Map(t.sections.map((s) => [s.key, s.group]));
  return new Set(t.occurrences.filter((o) => o.flowId === flowId).map((o) => groupOf.get(o.sectionKey)!));
}
function repeatOf(t: Compiled, flowId: string): string | undefined {
  return t.repeatGroups.find((r) => (r.flowIds ?? []).includes(flowId))?.key;
}

/** §4.3 table, verified on 09/10: forecast -> conclusion; missing = "assente". */
const TABLE: Record<string, Partial<Record<string, [string, string]>>> = {
  PROTOCOLLO: { ILIAD: ["F028", "F072"], TIM_FIBERCOP: ["F027", "F054"], FASTWEB_VODAFONE: ["F026", "F049"] },
  UT: { ILIAD: ["F126", "F135"], TOWERNET: ["F086", "F095"], TIM_FIBERCOP: ["F087", "F096"], INWIT: ["F092", "F101"], FASTWEB_VODAFONE: ["F063", "F072"], LEONARDO: ["F082", "F091"] },
  PE: { ILIAD: ["F140", "F149"], TOWERNET: ["F096", "F105"], TIM_FIBERCOP: ["F097", "F106"], INWIT: ["F106", "F115"], FASTWEB_VODAFONE: ["F073", "F087"], LEONARDO: ["F092", "F106"] },
  AIE: { ILIAD: ["F057", "F124"], TOWERNET: ["F036", "F040"], TIM_FIBERCOP: ["F045", "F049"], INWIT: ["F043", "F047"], FASTWEB_VODAFONE: ["F040", "F044"], LEONARDO: ["F035", "F039"] },
  PERMESSI: { ILIAD: ["F070", "F071"], TOWERNET: ["F045", "F043"], TIM_FIBERCOP: ["F052", "F053"], INWIT: ["F052", "F050"], FASTWEB_VODAFONE: ["F047", "F048"], LEONARDO: ["F046", "F047"] },
  ARPA: { ILIAD: ["F076", "F077"], TOWERNET: ["F051", "F052"], TIM_FIBERCOP: ["F058", "F059"], INWIT: ["F058", "F059"], FASTWEB_VODAFONE: ["F050", "F051"], LEONARDO: ["F051", "F052"] },
  ENTE: { ILIAD: ["F081", "F082"], TOWERNET: ["F057", "F058"], TIM_FIBERCOP: ["F064", "F065"], INWIT: ["F064", "F065"], FASTWEB_VODAFONE: ["F055", "F056"], LEONARDO: ["F057", "F058"] },
  GEOLOGICA: { ILIAD: ["F088", "F089"], TOWERNET: ["F068", "F069"], TIM_FIBERCOP: ["F083", "F084"], INWIT: ["F074", "F075"], LEONARDO: ["F070", "F071"] },
  DEPOSITO_SISMICO: { ILIAD: ["F151", "F152"], TOWERNET: ["F107", "F108"], TIM_FIBERCOP: ["F108", "F109"], INWIT: ["F117", "F118"], FASTWEB_VODAFONE: ["F098", "F099"], LEONARDO: ["F108", "F109"] },
  CIL: { ILIAD: ["F159", "F160"], TOWERNET: ["F115", "F116"], TIM_FIBERCOP: ["F116", "F117"], INWIT: ["F125", "F126"], FASTWEB_VODAFONE: ["F106", "F107"], LEONARDO: ["F116", "F117"] },
};

/** Forecasts whose template has no conclusion field (pendingOnly cannot be evaluated). */
const FORECAST_WITHOUT_COMPLETION = new Set(["MISURE_DI_FONDO"]);

describe("assistant date catalog (§4.3)", () => {
  it("is well formed", () => {
    expect(catalog.version).toBe(1);
    expect(catalog.entries.length).toBeGreaterThan(0);
    for (const e of catalog.entries) {
      const at = `${e.templateId} ${e.semanticId}`;
      expect(TEMPLATE_IDS as readonly string[], at).toContain(e.templateId);
      expect(GROUP_IDS as readonly string[], at).toContain(e.businessGroup);
      expect(GROUP_IDS as readonly string[], at).toContain(e.ownerGroup);
      expect(["FORECAST", "DEADLINE", "RECORDED"], at).toContain(e.dateKind);
      expect(e.semanticId, at).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(e.sourceDecision.trim(), at).not.toBe("");
    }
  });

  it("no semanticId twice in a template", () => {
    const seen = new Set<string>();
    for (const e of catalog.entries) {
      const key = `${e.templateId}/${e.semanticId}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("every flowId is a DATE master in the declared section, owner group and repeat group, with the template's label", () => {
    for (const e of catalog.entries) {
      const at = `${e.templateId} ${e.semanticId} ${e.flowId}`;
      const t = templates.get(e.templateId)!;
      const m = masterOf(t, e.flowId);
      expect(m, `${at}: no master`).toBeDefined();
      expect(m!.dataType, at).toBe("DATE");
      expect(m!.sectionKey, at).toBe(e.sectionKey);
      expect(m!.ownerGroup, at).toBe(e.ownerGroup);
      expect(m!.label, at).toBe(e.label);
      expect(repeatOf(t, e.flowId), at).toBe(e.repeatGroup);
      // The business group sees the date in one of its sections (master or mirror).
      const seenBy = new Set([...groupsShowing(t, e.flowId), ...(e.completionFlowId ? groupsShowing(t, e.completionFlowId) : [])]);
      expect(seenBy.has(e.businessGroup), `${at}: not shown to ${e.businessGroup}`).toBe(true);
    }
  });

  it("every completionFlowId is a DATE master on the same row, seen by the business or owner group", () => {
    for (const e of catalog.entries) {
      const at = `${e.templateId} ${e.semanticId}`;
      if (e.dateKind !== "FORECAST") {
        expect(e.completionFlowId, `${at}: only forecasts have a conclusion`).toBeUndefined();
        continue;
      }
      if (!e.completionFlowId) {
        expect(FORECAST_WITHOUT_COMPLETION.has(e.semanticId), `${at}: forecast without conclusion`).toBe(true);
        continue;
      }
      const t = templates.get(e.templateId)!;
      const c = masterOf(t, e.completionFlowId);
      expect(c, `${at}: no master for ${e.completionFlowId}`).toBeDefined();
      expect(c!.dataType, at).toBe("DATE");
      expect(repeatOf(t, e.completionFlowId), `${at}: conclusion on another row`).toBe(e.repeatGroup);
      const seenBy = groupsShowing(t, e.completionFlowId);
      expect(seenBy.has(e.businessGroup) || seenBy.has(e.ownerGroup), at).toBe(true);
    }
  });

  it("the ten milestones match the verified §4.3 table, and are missing where the table says 'assente'", () => {
    for (const [semanticId, perTemplate] of Object.entries(TABLE)) {
      for (const templateId of TEMPLATE_IDS) {
        const e = catalog.entries.find((x) => x.semanticId === semanticId && x.templateId === templateId);
        const expected = perTemplate[templateId];
        if (!expected) {
          expect(e, `${templateId} ${semanticId}: absent in §4.3`).toBeUndefined();
          continue;
        }
        expect(e, `${templateId} ${semanticId}`).toBeDefined();
        expect([e!.flowId, e!.completionFlowId], `${templateId} ${semanticId}`).toEqual(expected);
        expect(e!.dateKind).toBe("FORECAST");
      }
    }
  });

  it("ARPA and ENTE are bound to their rows; the explicit deadlines are DEADLINE", () => {
    for (const e of catalog.entries.filter((x) => x.semanticId === "ARPA" || x.semanticId === "ENTE")) {
      expect(e.repeatGroup, `${e.templateId} ${e.semanticId}`).toBe(e.semanticId);
    }
    const deadlines = catalog.entries.filter((x) => x.dateKind === "DEADLINE").map((x) => `${x.templateId}/${x.flowId}`);
    expect(deadlines.sort()).toEqual(["FASTWEB_VODAFONE/F058", "ILIAD/F085"]);
    expect(catalog.entries.find((x) => x.templateId === "FASTWEB_VODAFONE" && x.flowId === "F058")?.repeatGroup).toBe("ENTE");
  });

  it("Sopralluogo Enel where the template has it, Data Autorizzazione finale everywhere (memoria 09/10)", () => {
    const where = (s: string) => catalog.entries.filter((x) => x.semanticId === s).map((x) => x.templateId).sort();
    expect(where("SOPRALLUOGO_ENEL")).toEqual(["ILIAD", "INWIT", "TOWERNET"]);
    expect(where("AUTORIZZAZIONE_FINALE")).toEqual([...TEMPLATE_IDS].sort());
    expect(catalog.entries.filter((x) => x.semanticId === "SOPRALLUOGO_ENEL" || x.semanticId === "AUTORIZZAZIONE_FINALE").every((x) => x.dateKind === "RECORDED")).toBe(true);
  });

  it("owner and business group differ where the project says so", () => {
    const find = (t: string, s: string) => catalog.entries.find((x) => x.templateId === t && x.semanticId === s)!;
    // Forecast AIE is written by PM; Forecast PE FASTWEB by PM; Invio PE TIM by DL.
    expect(find("ILIAD", "AIE")).toMatchObject({ businessGroup: "AIE", ownerGroup: "PM_PERMESSI" });
    expect(find("FASTWEB_VODAFONE", "PE")).toMatchObject({ businessGroup: "UT_PE", ownerGroup: "PM_PERMESSI" });
    expect(find("TIM_FIBERCOP", "CONSEGNA_PE")).toMatchObject({ businessGroup: "UT_PE", ownerGroup: "DL" });
  });
});
