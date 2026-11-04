// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  dataScattoFatturabile,
  forecastGeologica,
  forecastOttenimentoPermessi,
  forecastOttenimentoPermessiBase,
  forecastProtocolloIliad,
  tipologiaAttivitaPE,
  verificaSpostamento,
} from "@/lib/formule-date";

describe("formule di calendario (D-42)", () => {
  it("Forecast Geologica = Assegnazione + 15 giorni di calendario", () => {
    expect(forecastGeologica("2026-10-08")).toBe("2026-10-23");
    expect(forecastGeologica("2026-12-20")).toBe("2027-01-04");
    expect(forecastGeologica(null)).toBeNull();
    expect(forecastGeologica("")).toBeNull();
  });

  it("Forecast Ottenimento Permessi base = Protocollo + 67 solo per TOWERNET, INWIT, LEONARDO", () => {
    expect(forecastOttenimentoPermessiBase("INWIT", "2026-10-08")).toBe("2026-12-14");
    expect(forecastOttenimentoPermessiBase("TOWERNET", "2026-10-08")).toBe("2026-12-14");
    expect(forecastOttenimentoPermessiBase("LEONARDO", "2026-12-01")).toBe("2027-02-06");
    for (const t of ["ILIAD", "TIM_FIBERCOP", "FASTWEB_VODAFONE"] as const) {
      expect(forecastOttenimentoPermessiBase(t, "2026-10-08"), t).toBeNull();
    }
    expect(forecastOttenimentoPermessiBase("INWIT", null)).toBeNull();
  });

  it("ILIAD Forecast Protocollo = Data assegnazione + 30 giorni", () => {
    expect(forecastProtocolloIliad("2026-10-08")).toBe("2026-11-07");
    expect(forecastProtocolloIliad("2028-02-01")).toBe("2028-03-02"); // anno bisestile
    expect(forecastProtocolloIliad(undefined)).toBeNull();
  });
});

describe("spostamento del Forecast Ottenimento Permessi per integrazione (D-42)", () => {
  const base = "2026-12-14";

  it("controllo dei 15 giorni sul giorno del salvataggio", () => {
    expect(verificaSpostamento(base, "2026-11-29")).toEqual({ eseguitoIl: "2026-11-29", giorniMancanti: 15, idoneo: true });
    expect(verificaSpostamento(base, "2026-11-28")).toEqual({ eseguitoIl: "2026-11-28", giorniMancanti: 16, idoneo: false });
    expect(verificaSpostamento(base, "2026-12-20")?.idoneo).toBe(true); // forecast base già passato
    expect(verificaSpostamento(null, "2026-12-01")).toBeNull();
  });

  it("senza integrazioni completate vale la base", () => {
    expect(forecastOttenimentoPermessi(base, []).forecast).toBe(base);
    expect(forecastOttenimentoPermessi(base, [{ richiesta: "2026-11-01", invio: null }]).forecast).toBe(base);
    expect(forecastOttenimentoPermessi(null, []).forecast).toBeNull();
  });

  it("sposta della durata dell'ultima integrazione se il controllo è idoneo", () => {
    const controllo = { eseguitoIl: "2026-12-05", giorniMancanti: 9, idoneo: true };
    const r = forecastOttenimentoPermessi(base, [{ richiesta: "2026-11-20", invio: "2026-12-05", controllo }]);
    expect(r.forecast).toBe("2026-12-29");
    expect(r.spostamentoGiorni).toBe(15);
    expect(r.motivazione).toContain("spostato di 15 giorni");
    expect(r.motivazione).toContain("29/12/2026");
  });

  it("non sposta se il controllo non è idoneo o non è stato eseguito", () => {
    const noIdoneo = { eseguitoIl: "2026-11-01", giorniMancanti: 43, idoneo: false };
    expect(forecastOttenimentoPermessi(base, [{ richiesta: "2026-10-20", invio: "2026-11-01", controllo: noIdoneo }]).forecast).toBe(base);
    expect(forecastOttenimentoPermessi(base, [{ richiesta: "2026-10-20", invio: "2026-11-01" }]).forecast).toBe(base);
  });

  it("usa solo l'ultima integrazione, senza sommare", () => {
    const ok = (eseguitoIl: string) => ({ eseguitoIl, giorniMancanti: 5, idoneo: true });
    const r = forecastOttenimentoPermessi(base, [
      { richiesta: "2026-11-01", invio: "2026-11-11", controllo: ok("2026-11-11") }, // 10 giorni
      { richiesta: "2026-12-01", invio: "2026-12-04", controllo: ok("2026-12-04") }, // 3 giorni
    ]);
    expect(r.spostamentoGiorni).toBe(3);
    expect(r.forecast).toBe("2026-12-17");
  });

  it("ricalcola il delta se le date vengono corrette, senza ripetere il controllo", () => {
    const controllo = { eseguitoIl: "2026-12-05", giorniMancanti: 9, idoneo: true };
    const r = forecastOttenimentoPermessi(base, [{ richiesta: "2026-11-25", invio: "2026-12-05", controllo }]);
    expect(r.spostamentoGiorni).toBe(10);
  });

  it("segnala date incoerenti senza spostare", () => {
    const controllo = { eseguitoIl: "2026-12-05", giorniMancanti: 9, idoneo: true };
    const r = forecastOttenimentoPermessi(base, [{ richiesta: "2026-12-05", invio: "2026-12-01", controllo }]);
    expect(r.forecast).toBe(base);
    expect(r.avviso).toBeDefined();
  });
});

describe("Fatturabile e Tipologia attività PE", () => {
  it("data di scatto di Fatturabile = Ottenimento Permessi + 30", () => {
    expect(dataScattoFatturabile("2026-12-14")).toBe("2027-01-13");
    expect(dataScattoFatturabile(null)).toBeNull();
  });

  it("Tipologia attività PE = Progetto se esiste ed è valorizzato, altrimenti Incarico", () => {
    const progetto = { code: "5G" };
    const incarico = { code: "NEW_SITE" };
    expect(tipologiaAttivitaPE({ templateHaProgetto: true, progetto, incaricoLavorazione: incarico })).toEqual(progetto);
    expect(tipologiaAttivitaPE({ templateHaProgetto: true, progetto: null, incaricoLavorazione: incarico })).toEqual(incarico);
    expect(tipologiaAttivitaPE({ templateHaProgetto: false, progetto, incaricoLavorazione: incarico })).toEqual(incarico);
    expect(tipologiaAttivitaPE({ templateHaProgetto: true, progetto: { code: "" }, incaricoLavorazione: incarico })).toEqual(incarico);
    expect(tipologiaAttivitaPE({ templateHaProgetto: true, progetto: { code: "ALTRO" }, incaricoLavorazione: incarico })).toEqual(incarico);
    expect(tipologiaAttivitaPE({ templateHaProgetto: true, progetto: { code: "ALTRO", otherText: "Pilota" } })).toEqual({ code: "ALTRO", otherText: "Pilota" });
    expect(tipologiaAttivitaPE({ templateHaProgetto: true })).toBeNull();
  });
});
