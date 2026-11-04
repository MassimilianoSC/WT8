// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addCalendarDays,
  addMonths,
  businessDeadlineAt9,
  diffCalendarDays,
  easterSunday,
  formatRomeTimestamp,
  holidayName,
  isBusinessDay,
  isHoliday,
  isValidIsoDate,
  nationalHolidays,
  nextBusinessDay,
  nineAmRome,
  parseIsoDate,
  rollForwardToBusinessDay,
  romeDate,
  romeOffsetMinutes,
  romeTime,
} from "@/lib/calendario";

describe("date YYYY-MM-DD", () => {
  it("rifiuta formati e date inesistenti", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-2-3")).toThrow(RangeError);
    expect(() => parseIsoDate("08/10/2026")).toThrow(RangeError);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
  });

  it("somma giorni di calendario attraverso mesi, anni e cambi d'ora", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-03-28", 2)).toBe("2026-03-30"); // passaggio all'ora legale
    expect(addCalendarDays("2026-10-24", 2)).toBe("2026-10-26"); // ritorno all'ora solare
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => addCalendarDays("2026-01-01", 1.5)).toThrow(RangeError);
  });

  it("somma mesi bloccando il fine mese", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("calcola la differenza in giorni", () => {
    expect(diffCalendarDays("2026-10-08", "2026-12-14")).toBe(67);
    expect(diffCalendarDays("2026-12-14", "2026-10-08")).toBe(-67);
  });
});

describe("festività nazionali", () => {
  it("calcola la Pasqua", () => {
    expect(easterSunday(2019)).toBe("2019-04-21");
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25"); // la più tardiva possibile
    expect(easterSunday(2285)).toBe("2285-03-22"); // la più anticipata possibile
  });

  it("include fisse e mobili, esclude i giorni normali", () => {
    for (const d of ["2026-01-01", "2026-01-06", "2026-04-25", "2026-05-01", "2026-06-02", "2026-08-15", "2026-11-01", "2026-12-08", "2026-12-25", "2026-12-26"]) {
      expect(isHoliday(d), d).toBe(true);
    }
    expect(holidayName("2026-04-06")).toBe("Lunedì dell'Angelo");
    expect(holidayName("2026-04-05")).toBe("Pasqua");
    expect(isHoliday("2026-04-07")).toBe(false);
    expect(isHoliday("2026-03-19")).toBe(false); // San Giuseppe: non nazionale
    expect(nationalHolidays(2026).size).toBe(13);
  });

  it("4 ottobre festivo solo dal 2026 (R-14)", () => {
    expect(isHoliday("2025-10-04")).toBe(false);
    expect(isHoliday("2027-10-04")).toBe(true);
    expect(isBusinessDay("2027-10-04")).toBe(false); // lunedì
  });
});

describe("giorni lavorativi", () => {
  it("riconosce weekend e festivi", () => {
    expect(isBusinessDay("2026-10-08")).toBe(true); // giovedì
    expect(isBusinessDay("2026-10-10")).toBe(false); // sabato
    expect(isBusinessDay("2026-10-11")).toBe(false); // domenica
    expect(isBusinessDay("2026-06-02")).toBe(false); // martedì festivo
  });

  it("somma giorni lavorativi in avanti", () => {
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-12"); // venerdì → lunedì
    expect(addBusinessDays("2026-04-03", 1)).toBe("2026-04-07"); // salta Pasqua e Pasquetta
    expect(addBusinessDays("2026-12-24", 1)).toBe("2026-12-28"); // salta Natale, S. Stefano, weekend
    expect(addBusinessDays("2026-10-08", 5)).toBe("2026-10-15");
    expect(addBusinessDays("2026-10-10", 0)).toBe("2026-10-10");
  });

  it("sottrae giorni lavorativi (N giorni prima)", () => {
    expect(addBusinessDays("2026-10-12", -1)).toBe("2026-10-09"); // lunedì → venerdì
    expect(addBusinessDays("2026-04-07", -1)).toBe("2026-04-03");
    expect(addBusinessDays("2026-06-03", -2)).toBe("2026-05-29"); // salta 2 giugno e weekend
  });

  it("trova il giorno lavorativo successivo", () => {
    expect(nextBusinessDay("2026-10-08")).toBe("2026-10-09");
    expect(nextBusinessDay("2026-10-09")).toBe("2026-10-12");
    expect(rollForwardToBusinessDay("2026-10-08")).toBe("2026-10-08");
    expect(rollForwardToBusinessDay("2026-08-15")).toBe("2026-08-17");
  });
});

describe("orari Europe/Rome", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("calcola le 09:00 con ora solare e legale", () => {
    expect(nineAmRome("2026-01-15").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(nineAmRome("2026-03-28").toISOString()).toBe("2026-03-28T08:00:00.000Z"); // ultimo giorno di solare
    expect(nineAmRome("2026-03-29").toISOString()).toBe("2026-03-29T07:00:00.000Z"); // primo di legale
    expect(nineAmRome("2026-10-24").toISOString()).toBe("2026-10-24T07:00:00.000Z"); // ultimo di legale
    expect(nineAmRome("2026-10-25").toISOString()).toBe("2026-10-25T08:00:00.000Z"); // primo di solare
    expect(romeTime("2026-07-01", 23, 30).toISOString()).toBe("2026-07-01T21:30:00.000Z");
    expect(() => romeTime("2026-07-01", 24, 0)).toThrow(RangeError);
  });

  it("non dipende dal fuso del processo", () => {
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(nineAmRome("2026-03-29").toISOString(), tz).toBe("2026-03-29T07:00:00.000Z");
      expect(romeDate(new Date("2026-10-07T22:30:00Z")), tz).toBe("2026-10-08");
    }
  });

  it("legge lo scostamento del fuso", () => {
    expect(romeOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(60);
    expect(romeOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(120);
  });

  it("fa slittare la scadenza al primo giorno lavorativo alle 09:00", () => {
    expect(businessDeadlineAt9("2026-08-15").toISOString()).toBe("2026-08-17T07:00:00.000Z"); // sabato festivo → lunedì
    expect(businessDeadlineAt9("2026-12-25").toISOString()).toBe("2026-12-28T08:00:00.000Z");
    expect(businessDeadlineAt9("2026-10-08").toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });

  it("restituisce il giorno di Roma e il timestamp con offset", () => {
    expect(romeDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(romeDate(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
    expect(formatRomeTimestamp(new Date("2026-10-08T07:00:00Z"))).toBe("2026-10-08T09:00:00+02:00");
    expect(formatRomeTimestamp(new Date("2026-12-01T08:00:00Z"))).toBe("2026-12-01T09:00:00+01:00");
  });
});
