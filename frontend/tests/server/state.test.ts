// @vitest-environment node
/** Motore dello Stato attività: casi della tabella §4.4 dell'architettura, con D-41 e D-115 (Guida §14 corretta). */
import { describe, expect, it } from "vitest";
import type { TemplateId } from "@/lib/contract";
import { STATE_RULES, applyState, deriveAutomaticState, isNewerEvent, newStateMeta, type StateInput } from "@/lib/engines/state";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import initial from "@/data/templates/lists-initial.json";

const inwit = (values: StateInput["values"] = {}, integrazioni: Array<[string, number, string | null]> = []): StateInput => ({
  templateId: "INWIT",
  values,
  repeats: { INTEGRAZIONE: integrazioni.map(([rowId, ordinal, d]) => ({ rowId, ordinal, values: d ? { F055: d } : {} })) },
});

describe("regole come dati", () => {
  it("ogni regola punta a un campo DATE master del template compilato; il campo valore è il SELECT della sua lista", () => {
    const lists = (initial as unknown as { lists: Array<{ templateId: string | null; listId: string; items: Array<{ code: string }> }> }).lists;
    for (const r of STATE_RULES.rules) {
      const t = COMPILED_TEMPLATES[r.templateId as TemplateId].template;
      const m = t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === r.dateFlowId);
      expect(m, r.ruleId).toBeDefined();
      expect(m!.dataType, r.ruleId).toBe("DATE");
      expect(m!.repeatGroup, r.ruleId).toBe(r.repeatGroup);
      expect(!!r.status !== !!r.valueFlowId, r.ruleId).toBe(true);
      if (r.valueFlowId) {
        const v = t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === r.valueFlowId)!;
        expect(v.dataType, r.ruleId).toBe("SELECT");
        const codes = lists.find((l) => l.templateId === r.templateId && l.listId === v.list!.listId)!.items.map((i) => i.code);
        for (const c of [...Object.keys(r.statusByValue ?? {}), ...Object.keys(r.pendingValues ?? {})]) expect(codes, r.ruleId).toContain(c);
      }
    }
  });
  it("regole di D-115: ASSEGNATO, PROTOCOLLATO, REALIZZATO ovunque; integrazioni tranne FASTWEB; esito finale solo TOWERNET e INWIT", () => {
    const active = STATE_RULES.rules.filter((r) => r.active);
    expect(active).toHaveLength(STATE_RULES.rules.length);
    const by = (st: string) => active.filter((r) => r.status === st).map((r) => r.templateId).sort();
    const all = ["FASTWEB_VODAFONE", "ILIAD", "INWIT", "LEONARDO", "TIM_FIBERCOP", "TOWERNET"];
    expect(by("ASSEGNATO")).toEqual(all);
    expect(by("PROTOCOLLATO")).toEqual(all);
    expect(by("REALIZZATO")).toEqual(all);
    expect(by("INTEGRAZIONE_RICHIESTA")).toEqual(all.filter((t) => t !== "FASTWEB_VODAFONE"));
    expect(active.some((r) => r.status === "IN_APPROVAZIONE")).toBe(false);
    expect(STATE_RULES.statusOrder.ranks.IN_APPROVAZIONE).toBeUndefined();
    expect(active.filter((r) => r.valueFlowId).map((r) => r.templateId).sort()).toEqual(["INWIT", "TOWERNET"]);
  });
});

describe("§4.4", () => {
  it("nuova pratica / nuova iterazione: CREATA, nessun residuo", () => {
    expect(deriveAutomaticState(inwit()).stato).toBe("CREATA");
    expect(newStateMeta()).toEqual({ stato: "CREATA", source: "AUTO", autoStato: "CREATA", autoEvent: null, manualBaseline: null, manualAt: null, manualBy: null });
  });

  it("Data assegnazione valorizzata → ASSEGNATO; date non valide ignorate", () => {
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01" }))).toMatchObject({ stato: "ASSEGNATO", ruleId: "ASSEGNATO_INWIT", date: "2026-10-01" });
    expect(deriveAutomaticState(inwit({ F023: "2026-02-30" })).stato).toBe("CREATA");
    expect(deriveAutomaticState(inwit({ F023: "01/10/2026" })).stato).toBe("CREATA");
  });

  it("Richiesta integrazione successiva → INTEGRAZIONE_RICHIESTA, con la riga", () => {
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01" }, [["r1", 1, "2026-10-05"]]))).toMatchObject({ stato: "INTEGRAZIONE_RICHIESTA", rowId: "r1" });
  });

  it("modifica oggi una richiesta più vecchia: vince la data più recente, non l'ultimo salvataggio", () => {
    const s = deriveAutomaticState(inwit({ F023: "2026-10-20" }, [["r1", 1, "2026-10-05"], ["r2", 2, "2026-09-01"]]));
    expect(s).toMatchObject({ stato: "ASSEGNATO", date: "2026-10-20" });
  });

  it("svuotamento o rimozione della richiesta vincente: fallback al massimo restante, poi CREATA", () => {
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01" }, [["r1", 1, null]])).stato).toBe("ASSEGNATO");
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01" }, [])).stato).toBe("ASSEGNATO");
    expect(deriveAutomaticState(inwit({ F023: null }, [])).stato).toBe("CREATA");
  });

  it("trigger nel 2027 salvato nel 2026: vince la data 2027 (D-41)", () => {
    expect(deriveAutomaticState(inwit({ F023: "2027-03-01" }, [["r1", 1, "2026-12-01"]])).stato).toBe("ASSEGNATO");
  });

  it("parità di data: INTEGRAZIONE_RICHIESTA > ASSEGNATO (rango provvisorio R-16)", () => {
    const s = deriveAutomaticState(inwit({ F023: "2026-10-05" }, [["r1", 1, "2026-10-05"]]));
    expect(s.stato).toBe("INTEGRAZIONE_RICHIESTA");
    expect(s.diagnostics).toEqual([]);
  });

  it("parità tra stati dello stesso rango: diagnostica, non un criterio arbitrario", () => {
    const data = {
      ...STATE_RULES,
      rules: [
        { ruleId: "A", templateId: "INWIT" as const, status: "AUTORIZZATO" as const, dateFlowId: "F070", active: true, source: "prova" },
        { ruleId: "D", templateId: "INWIT" as const, status: "DINIEGATO" as const, dateFlowId: "F071", active: true, source: "prova" },
      ],
    };
    const s = deriveAutomaticState({ templateId: "INWIT", values: { F070: "2026-10-05", F071: "2026-10-05" }, repeats: {} }, data);
    expect(s.diagnostics[0]).toMatch(/TIE_UNRESOLVED/);
  });

  it("regole di un altro template o non attive non contano", () => {
    expect(deriveAutomaticState({ templateId: "FASTWEB_VODAFONE", values: { F023: "2026-10-01" }, repeats: {} }).stato).toBe("CREATA");
  });
});

describe("nuovi trigger (D-115)", () => {
  const tw = (values: StateInput["values"]): StateInput => ({ templateId: "TOWERNET", values, repeats: {} });
  it("PROTOCOLLATO dal Protocollo e REALIZZATO dalla Data FL; vince la data più recente", () => {
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01", F051: "2026-10-10" }))).toMatchObject({ stato: "PROTOCOLLATO", ruleId: "PROTOCOLLATO_INWIT" });
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01", F051: "2026-10-10", F127: "2027-02-01" })).stato).toBe("REALIZZATO");
    expect(deriveAutomaticState(inwit({ F051: "2026-10-10" }, [["r1", 1, "2026-10-20"]])).stato).toBe("INTEGRAZIONE_RICHIESTA");
  });

  it("Autorizzazione finale: lo stato segue il valore quando la data è compilata", () => {
    expect(deriveAutomaticState(tw({ F062: { code: "AUTORIZZATO" }, F064: "2026-11-01" }))).toMatchObject({ stato: "AUTORIZZATO", ruleId: "AUTORIZZAZIONE_FINALE_TOWERNET" });
    expect(deriveAutomaticState(tw({ F062: { code: "DINIEGATO" }, F064: "2026-11-01" })).stato).toBe("DINIEGATO");
    expect(deriveAutomaticState(tw({ F062: { code: "TAR" }, F064: "2026-11-01" })).stato).toBe("TAR");
    expect(deriveAutomaticState(tw({ F062: { code: "AUTORIZZATO" } })).stato).toBe("CREATA"); // senza data nessun evento
    expect(deriveAutomaticState(tw({ F064: "2026-11-01" })).stato).toBe("CREATA"); // senza valore nessun evento
    expect(deriveAutomaticState(tw({ F062: { code: " " }, F064: "2026-11-01" })).stato).toBe("CREATA");
  });

  it("Autorizzazione finale = KO → KO in TOWERNET e in INWIT (D-120 A2)", () => {
    expect(deriveAutomaticState(tw({ F020: "2026-10-01", F062: { code: "KO" }, F064: "2026-11-01" })).stato).toBe("KO");
    expect(deriveAutomaticState(inwit({ F023: "2026-10-01", F069: { code: "KO" }, F070: "2026-11-01" })).stato).toBe("KO");
    expect(deriveAutomaticState(inwit({ F069: { code: "AUTORIZZATO" }, F070: "2026-11-01" })).stato).toBe("AUTORIZZATO");
  });

  it("negli altri gestori la Data Autorizzazione finale non produce stati; FASTWEB senza integrazioni", () => {
    expect(deriveAutomaticState({ templateId: "TIM_FIBERCOP", values: { F069: "2026-11-01" }, repeats: {} }).stato).toBe("CREATA");
    expect(deriveAutomaticState({ templateId: "FASTWEB_VODAFONE", values: { F059: "2026-11-01", F049: "2026-10-01" }, repeats: {} }).stato).toBe("PROTOCOLLATO");
  });

  it("parità di data: ordine D-109 (REALIZZATO > esito finale > INTEGRAZIONE > PROTOCOLLATO > ASSEGNATO)", () => {
    expect(deriveAutomaticState(tw({ F020: "2026-11-01", F044: "2026-11-01" })).stato).toBe("PROTOCOLLATO");
    expect(deriveAutomaticState(tw({ F044: "2026-11-01", F062: { code: "KO" }, F064: "2026-11-01" })).stato).toBe("KO");
    expect(deriveAutomaticState(tw({ F117: "2026-11-01", F062: { code: "AUTORIZZATO" }, F064: "2026-11-01" })).stato).toBe("REALIZZATO");
  });
});

describe("manuale (D-115, D-119, D-126 M-01)", () => {
  const at = new Date("2026-10-08T07:00:00Z");
  const manualOn = (input: StateInput, stato: "STAND_BY" | "KO" | "TERMINATO" | "IN_APPROVAZIONE") =>
    applyState(newStateMeta(), deriveAutomaticState(input), { stato, actorId: null, at }).next;
  const step = (prev: ReturnType<typeof manualOn>, input: StateInput) => applyState(prev, deriveAutomaticState(input));

  it("comando manuale: stato e fonte MANUAL, automatico ed evento di riferimento memorizzati", () => {
    const r = applyState(newStateMeta(), deriveAutomaticState(inwit({ F023: "2026-10-01" })), { stato: "STAND_BY", actorId: null, at });
    expect(r.next).toMatchObject({
      stato: "STAND_BY",
      source: "MANUAL",
      autoStato: "ASSEGNATO",
      autoEvent: { ruleId: "ASSEGNATO_INWIT", date: "2026-10-01" },
      manualBaseline: { ruleId: "ASSEGNATO_INWIT", date: "2026-10-01" },
      manualAt: at,
    });
    expect(r).toMatchObject({ changed: true, from: "CREATA", to: "STAND_BY", manualReleased: false });
  });

  it("salvataggio senza nuovo evento: il manuale resta", () => {
    const m = manualOn(inwit({ F023: "2026-10-01" }), "IN_APPROVAZIONE");
    const r = step(m, inwit({ F023: "2026-10-01", F999: "x" }));
    expect(r).toMatchObject({ changed: false, manualReleased: false, next: { stato: "IN_APPROVAZIONE", source: "MANUAL", autoStato: "ASSEGNATO" } });
  });

  it("evento più recente di un'altra regola: rilascia", () => {
    const m = manualOn(inwit({ F023: "2026-10-01" }), "STAND_BY");
    const r = step(m, inwit({ F023: "2026-10-01", F051: "2026-10-15" }));
    expect(r).toMatchObject({ changed: true, manualReleased: true, from: "STAND_BY", to: "PROTOCOLLATO", next: { source: "AUTO", manualBaseline: null, manualAt: null, manualBy: null } });
  });

  it("(a) svuotare il trigger vincente (l'automatico torna indietro) NON rilascia", () => {
    const m = manualOn(inwit({ F023: "2026-10-01", F051: "2026-10-15" }), "TERMINATO");
    const back = step(m, inwit({ F023: "2026-10-01", F051: null }));
    expect(back).toMatchObject({ manualReleased: false, next: { stato: "TERMINATO", source: "MANUAL", autoStato: "ASSEGNATO" } });
    const none = step(back.next, inwit({}));
    expect(none.next).toMatchObject({ stato: "TERMINATO", source: "MANUAL", autoStato: "CREATA", autoEvent: null });
    // il trigger rimesso con la stessa data non è un evento nuovo
    expect(step(none.next, inwit({ F023: "2026-10-01", F051: "2026-10-15" })).next.source).toBe("MANUAL");
  });

  it("(b) nuova Richiesta integrazione più recente con lo stesso stato calcolato: rilascia", () => {
    const m = manualOn(inwit({ F023: "2026-10-01" }, [["r1", 1, "2026-10-05"]]), "STAND_BY");
    expect(m.autoStato).toBe("INTEGRAZIONE_RICHIESTA");
    const r = step(m, inwit({ F023: "2026-10-01" }, [["r1", 1, "2026-10-05"], ["r2", 2, "2026-10-12"]]));
    expect(r).toMatchObject({ manualReleased: true, to: "INTEGRAZIONE_RICHIESTA", next: { source: "AUTO", autoEvent: { rowId: "r2", date: "2026-10-12" } } });
  });

  it("(c) data del trigger vincente corretta in una più recente: rilascia; in una più vecchia: no", () => {
    const m = manualOn(inwit({ F023: "2026-10-01" }), "STAND_BY");
    expect(step(m, inwit({ F023: "2026-10-20" }))).toMatchObject({ manualReleased: true, to: "ASSEGNATO" });
    expect(step(m, inwit({ F023: "2026-09-20" }))).toMatchObject({ manualReleased: false, next: { stato: "STAND_BY" } });
  });

  it("stessa data, altro evento vincente (regola diversa per rango): rilascia", () => {
    const m = manualOn(inwit({ F023: "2026-10-05" }), "STAND_BY");
    expect(step(m, inwit({ F023: "2026-10-05", F051: "2026-10-05" }))).toMatchObject({ manualReleased: true, to: "PROTOCOLLATO" });
  });

  it("manuale senza alcun trigger: il primo evento rilascia", () => {
    const m = manualOn(inwit({}), "STAND_BY");
    expect(m.manualBaseline).toBeNull();
    expect(step(m, inwit({}))).toMatchObject({ manualReleased: false });
    expect(step(m, inwit({ F023: "2026-10-01" }))).toMatchObject({ manualReleased: true, to: "ASSEGNATO" });
  });

  it("isNewerEvent: ordine completo stretto (data, rango, ordinal) — D-126 M-01", () => {
    // Identità distinte per regola (rango) e riga (ordinal), come nei dati veri.
    const e = (date: string, rank = 1, ordinal = 0, ruleId = `R${rank}`) => ({ ruleId, date, rank, ordinal, ...(ordinal ? { rowId: `row${ordinal}` } : {}) });
    expect(isNewerEvent(null, e("2026-10-01"))).toBe(false);
    expect(isNewerEvent(e("2026-10-01"), null)).toBe(true);
    expect(isNewerEvent(e("2026-10-02"), e("2026-10-01", 6))).toBe(true);
    expect(isNewerEvent(e("2026-09-30", 6), e("2026-10-01"))).toBe(false);
    expect(isNewerEvent(e("2026-10-01"), e("2026-10-01"))).toBe(false);
    expect(isNewerEvent(e("2026-10-01", 3), e("2026-10-01", 1))).toBe(true); // stessa data, rango superiore
    expect(isNewerEvent(e("2026-10-01", 1, 0, "S"), e("2026-10-01", 3))).toBe(false); // fallback a rango inferiore
    expect(isNewerEvent(e("2026-10-01", 4, 2), e("2026-10-01", 4, 1))).toBe(true); // riga pari data, ordinal successivo
    expect(isNewerEvent(e("2026-10-01", 4, 1), e("2026-10-01", 4, 2))).toBe(false); // riga vincente tolta
    expect(isNewerEvent({ ...e("2026-10-01", 5), stato: "DINIEGATO" as const }, { ...e("2026-10-01", 5), stato: "AUTORIZZATO" as const })).toBe(true); // D-127
    expect(isNewerEvent({ ...e("2026-10-01", 5), stato: "KO" as const }, { ...e("2026-10-01", 5, 0, "ALTRA"), stato: "AUTORIZZATO" as const })).toBe(false); // altra regola, stessa tupla
    expect(isNewerEvent({ ...e("2026-10-01", 5), stato: "AUTORIZZATO" as const }, { ...e("2026-10-01", 5), stato: "AUTORIZZATO" as const })).toBe(false); // stesso trigger, stesso esito
  });

  it("R1 (revisione): svuotare il Protocollo con l'Assegnazione alla stessa data NON rilascia il manuale", () => {
    const m = manualOn(inwit({ F023: "2026-10-05", F051: "2026-10-05" }), "TERMINATO");
    const r = step(m, inwit({ F023: "2026-10-05", F051: null }));
    expect(r).toMatchObject({ manualReleased: false, changed: false, next: { stato: "TERMINATO", source: "MANUAL", autoStato: "ASSEGNATO" } });
  });

  it("R1b (revisione): togliere l'integrazione vincente con un'altra riga alla stessa data NON rilascia il manuale", () => {
    const m = manualOn(inwit({}, [["old", 1, "2026-10-05"], ["latest", 2, "2026-10-05"]]), "STAND_BY");
    const r = step(m, inwit({}, [["old", 1, "2026-10-05"]]));
    expect(r).toMatchObject({ manualReleased: false, next: { stato: "STAND_BY", source: "MANUAL", autoStato: "INTEGRAZIONE_RICHIESTA" } });
  });

  it("nuova riga di integrazione alla stessa data con ordinal successivo: evento nuovo, rilascia", () => {
    const m = manualOn(inwit({}, [["a", 1, "2026-10-05"]]), "STAND_BY");
    expect(step(m, inwit({}, [["a", 1, "2026-10-05"], ["b", 2, "2026-10-05"]]))).toMatchObject({ manualReleased: true, to: "INTEGRAZIONE_RICHIESTA" });
  });

  it("D-127: esito finale cambiato con la stessa data è un evento nuovo e rilascia; lo stesso esito no", () => {
    const tw = (v: string) => ({ templateId: "TOWERNET" as const, values: { F062: { code: v }, F064: "2026-11-01" }, repeats: {} });
    const m = applyState(newStateMeta(), deriveAutomaticState(tw("AUTORIZZATO")), { stato: "STAND_BY", actorId: null, at }).next;
    expect(applyState(m, deriveAutomaticState(tw("DINIEGATO")))).toMatchObject({ manualReleased: true, next: { stato: "DINIEGATO", source: "AUTO" } });
    expect(applyState(m, deriveAutomaticState(tw("AUTORIZZATO"))).next).toMatchObject({ stato: "STAND_BY", source: "MANUAL" });
  });

  it("senza manuale lo stato segue l'automatico e segnala il cambio", () => {
    const r = applyState(newStateMeta(), deriveAutomaticState(inwit({ F023: "2026-10-01" })));
    expect(r).toMatchObject({ changed: true, to: "ASSEGNATO", next: { source: "AUTO" } });
    expect(applyState(r.next, deriveAutomaticState(inwit({ F023: "2026-10-01" }))).changed).toBe(false);
  });
});
