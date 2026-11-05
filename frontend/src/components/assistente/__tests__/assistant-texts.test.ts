import { describe, expect, it } from "vitest";
import type { MeDTO, MembershipDTO } from "@/lib/contract";
import { APP_WORKS, answerStateNotice, outcomeNotice, readAtText } from "@/components/assistente/assistant-errors";
import { sourceDetail, sourceHref, splitCitations, withoutModelLinks } from "@/components/assistente/source-links";
import { MAX_SUGGESTIONS, suggestionsFor } from "@/components/assistente/suggestions";
import { answerBlocks, inlineRuns } from "@/components/assistente/answer-text";
import type { AssistantErrorCode } from "@/components/assistente/types";
import { LIST_SOURCE, PRACTICE_SOURCE, demoStatus } from "@/components/__fixtures__/demo-assistant";

const CODES: AssistantErrorCode[] = [
  "UNAUTHENTICATED", "AUTH_CHANGED", "NOT_ENABLED", "ORIGIN_DENIED", "NOT_FOUND", "CONVERSATION_NOT_FOUND",
  "BUSY_USER", "CONVERSATION_EXPIRED", "DATA_CHANGED", "BODY_TOO_LARGE", "INVALID_REQUEST", "QUERY_TOO_BROAD",
  "QUOTA_USER_MINUTE", "QUOTA_USER_DAY", "BUSY", "PROVIDER_QUOTA", "UNAVAILABLE", "TIMEOUT", "BLOCKED", "INTERNAL",
];

describe("outcomeNotice", () => {
  it("every contract code has its own Italian text, never the server's", () => {
    for (const code of CODES) {
      const n = outcomeNotice({ kind: "error", code, message: "server says something" }, demoStatus());
      expect(n.title, code).not.toBe("");
      if (code !== "QUERY_TOO_BROAD") expect(n.title, code).not.toContain("server says");
    }
  });

  it("technical failures say the app works and give the support address; Google's quota is not a company limit", () => {
    for (const code of ["PROVIDER_QUOTA", "UNAVAILABLE", "TIMEOUT", "INTERNAL", "NETWORK"] as const) {
      const n = outcomeNotice({ kind: "error", code });
      expect(n.tone).toBe("error");
      expect(n.detail).toContain(APP_WORKS);
      expect(n.detail).toContain("operations@hqe.it");
      expect(n.action).toBe("retry");
    }
    expect(outcomeNotice({ kind: "error", code: "PROVIDER_QUOTA" }).title).not.toMatch(/aziend|giornalier|oggi/i);
  });

  it("quota is yellow, blocked and too broad are neutral", () => {
    expect(outcomeNotice({ kind: "error", code: "QUOTA_USER_DAY" }, demoStatus()).tone).toBe("quota");
    expect(outcomeNotice({ kind: "error", code: "QUOTA_USER_MINUTE" }, demoStatus()).tone).toBe("quota");
    expect(outcomeNotice({ kind: "error", code: "BLOCKED" })).toMatchObject({ tone: "neutral", title: "Non posso rispondere a questa domanda." });
    expect(outcomeNotice({ kind: "error", code: "QUERY_TOO_BROAD", message: "Restringi a un cliente." }).title).toBe("Restringi a un cliente.");
    expect(outcomeNotice({ kind: "error", code: "NOT_ENABLED" }).title).toBe("Assistente disattivato dall'amministratore.");
  });

  it("answer states: plain answer has no note, a truncated one does", () => {
    expect(answerStateNotice("ANSWER", false)).toBeNull();
    expect(answerStateNotice("ANSWER", true)?.title).toContain("troncata");
    expect(answerStateNotice("INSUFFICIENT_EVIDENCE", false)?.tone).toBe("neutral");
    expect(answerStateNotice("OUT_OF_SCOPE", false)?.title).toBe("Rispondo solo sui dati di WT8.");
  });

  it("read time in Rome, with the interval when the reading spans minutes", () => {
    expect(readAtText("2026-10-09T08:42:01Z", "2026-10-09T08:42:30Z")).toBe("Dati letti alle 10:42");
    expect(readAtText("2026-10-09T08:41:50Z", "2026-10-09T08:42:30Z")).toBe("Dati letti tra le 10:41 e le 10:42");
  });
});

describe("source links: Andamento (D-198)", () => {
  const andamento = (blocco: "stati" | "ferme", label: string, templateId: "ILIAD" | null = null) =>
    ({
      kind: "ANDAMENTO",
      label,
      blocco,
      query: { templateId, from: "2026-07-01", to: "2026-09-30", granularity: "week" },
      readAt: "2026-10-11T10:00:00+02:00",
    }) as const;

  it("opens Andamento with the same filters, scrolled to the block", () => {
    expect(sourceHref(andamento("stati", "Andamento", "ILIAD"))).toBe("/andamento?template=ILIAD&da=2026-07-01&a=2026-09-30&passo=settimana#stati");
  });

  it("the line names the block (unless the label does), the client and the period; stopped practices are today's picture", () => {
    expect(sourceDetail(andamento("stati", "Andamento"))).toBe("Tempo per stato · tutti i clienti · dal 01/07/2026 al 30/09/2026");
    expect(sourceDetail(andamento("stati", "Andamento: tempo per stato", "ILIAD"))).toBe("ILIAD · dal 01/07/2026 al 30/09/2026");
    expect(sourceDetail(andamento("ferme", "Andamento"))).toBe("Pratiche ferme · tutti i clienti · situazione di oggi");
  });
});

describe("source links", () => {
  it("practice: the same link as the notifications; list and Statistiche: the view with its filters", () => {
    expect(sourceHref(PRACTICE_SOURCE)).toBe("/pratiche/p-iliad-1?iterazione=2&sezione=PERMESSI&campo=forecast_ottenimento_permessi");
    expect(sourceHref({ ...PRACTICE_SOURCE, occurrenceKey: undefined, flowId: "F1", rowId: "r-9" } as typeof PRACTICE_SOURCE)).toBe(
      "/pratiche/p-iliad-1?iterazione=2&sezione=PERMESSI&campo=F1&riga=r-9"
    );
    expect(sourceHref(LIST_SOURCE)).toBe("/pratiche?template=ILIAD&stato=ASSEGNATO");
    expect(sourceHref({ kind: "LIST", label: "x", query: { archived: true, from: "2026-10-01" }, readAt: "" })).toBe("/pratiche/archivio?da=2026-10-01");
    expect(sourceHref({ kind: "STATS", label: "x", query: { templateId: "ILIAD", from: "2026-10-01", to: "2026-10-31" }, readAt: "" })).toBe(
      "/statistiche?template=ILIAD&da=2026-10-01&a=2026-10-31"
    );
    expect(sourceHref({ kind: "WORKLOAD", label: "x", query: { templateId: "ILIAD", group: "DL" }, readAt: "" })).toBe("/statistiche?vista=carichi&template=ILIAD&gruppo=DL");
    expect(sourceHref({ kind: "QUERY", label: "x", question: "Forecast & stato?", readAt: "" })).toBe("/assistente?domanda=Forecast%20%26%20stato%3F");
  });

  it("the filters are also spelled out in the source line", () => {
    expect(sourceDetail(LIST_SOURCE)).toBe("ILIAD · stato ASSEGNATO");
    expect(sourceDetail({ kind: "LIST", label: "x", query: { templateId: "TIM_FIBERCOP", from: "2026-10-01", to: "2026-10-31", q: "Roma" }, readAt: "" })).toBe(
      'TIM / FIBERCOP · ricerca "Roma" · creazione dal 01/10/2026 al 31/10/2026'
    );
    expect(sourceDetail({ kind: "STATS", label: "x", query: { from: "2026-10-01", to: "2026-10-31" }, readAt: "" })).toBe("tutti i clienti · dal 01/10/2026 al 31/10/2026");
    expect(sourceDetail({ kind: "WORKLOAD", label: "x", query: { templateId: "ILIAD", group: "UT_PE" }, readAt: "" })).toBe("ILIAD · UT/PE · Carichi di lavoro");
  });

  it("a practice whose label already names the site is not repeated in the line", () => {
    const named = { ...PRACTICE_SOURCE, label: "IL-TO-0001 — Torino Lingotto" } as typeof PRACTICE_SOURCE;
    expect(sourceDetail(named)).toBe("ILIAD · iterazione 2");
    expect(sourceDetail(PRACTICE_SOURCE)).toBe("IL-TO-0001 · Torino Lingotto · ILIAD · iterazione 2");
  });

  it("the model's Markdown links keep only their text; a bare number stays a reference [n]", () => {
    expect(withoutModelLinks("Vedi [Roma Ostiense (TF-RM-0001)](1).")).toBe("Vedi Roma Ostiense (TF-RM-0001).");
    expect(withoutModelLinks("[sito](https://evil.example/x?d=1) e [qui](http://evil.example)")).toBe("sito e qui");
    expect(withoutModelLinks("[clicca](javascript:alert(document.cookie))")).toBe("clicca");
    expect(withoutModelLinks("![immagine](https://evil.example/i.png)")).toBe("immagine");
    expect(withoutModelLinks("<https://evil.example> <javascript:alert(1)>")).toBe("https://evil.example javascript:alert(1)");
    expect(withoutModelLinks("fonte [2](https://evil.example)")).toBe("fonte [2]");
    expect(splitCitations("[Roma Ostiense (TF-RM-0001)](1) e [2](http://x)")).toEqual(["Roma Ostiense (TF-RM-0001) e ", 2]);
  });

  it("splits [n] references", () => {
    expect(splitCitations("Sono 7 [2]. Prima [1][3]")).toEqual(["Sono 7 ", 2, ". Prima ", 1, 3]);
    expect(splitCitations("nessuna")).toEqual(["nessuna"]);
  });
});

const me = (memberships: MembershipDTO[], isAdmin = false): MeDTO => ({
  id: "u",
  name: "U",
  email: "u@x",
  status: "active",
  isAdmin,
  memberships,
  createdAt: "",
  updatedAt: "",
  canCreate: [],
  mustChangePassword: false,
});

describe("answer text: the model's light Markdown as structure, never HTML or links", () => {
  it("bold runs keep their [n] references; an unclosed '**' (streaming) stays as written", () => {
    expect(inlineRuns("Stato **ASSEGNATO** [1].")).toEqual([
      { strong: false, parts: ["Stato "] },
      { strong: true, parts: ["ASSEGNATO"] },
      { strong: false, parts: [" ", 1, "."] },
    ]);
    expect(inlineRuns("**Forecast UT [3]**")).toEqual([{ strong: true, parts: ["Forecast UT ", 3] }]);
    expect(inlineRuns("in arrivo **Sito")).toEqual([{ strong: false, parts: ["in arrivo **Sito"] }]);
  });

  it("paragraphs, '- ' / '* ' lists, numbered lists and titles (as on the installation)", () => {
    const text = [
      "## Riepilogo",
      "La pratica è **ASSEGNATO** [1].",
      "",
      "Principali dati:",
      "- **Sopralluogo**: 28/09/2026 [7].",
      "* Invio PE [8]",
      "1. primo",
      "2) secondo",
    ].join("\n");
    const blocks = answerBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(["p", "p", "p", "ul", "ol"]);
    expect(blocks[0]).toEqual({ kind: "p", heading: true, runs: [{ strong: false, parts: ["Riepilogo"] }] });
    expect(blocks[3]).toEqual({
      kind: "ul",
      items: [
        [{ strong: true, parts: ["Sopralluogo"] }, { strong: false, parts: [": 28/09/2026 ", 7, "."] }],
        [{ strong: false, parts: ["Invio PE ", 8] }],
      ],
    });
    expect(blocks[4]).toMatchObject({ kind: "ol", items: [[{ parts: ["primo"] }], [{ parts: ["secondo"] }]] });
  });

  it("the model's links stay text: no address reaches the panel", () => {
    const parts = answerBlocks("Vedi **[sito](https://evil.example)** e <javascript:alert(1)>").flatMap((b) => (b.kind === "p" ? b.runs : b.items.flat())).flatMap((r) => r.parts);
    expect(parts.join("")).toBe("Vedi sito e javascript:alert(1)");
  });
});

describe("suggestions", () => {
  it("follow what the user does in the current template, at most four", () => {
    const tecnico = me([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]);
    expect(suggestionsFor(tecnico, null)).toEqual(["Le pratiche in cui sono indicato come tecnico.", "Le mie consegne previste entro venerdì."]);

    const leaderAie = me([{ templateId: "INWIT", group: "AIE", role: "AIE", leader: true }]);
    expect(suggestionsFor(leaderAie, null)[0]).toBe("Carico del mio gruppo su INWIT.");

    const permessi = me([{ templateId: "ILIAD", group: "PM_PERMESSI", role: "PERMESSI", leader: false }]);
    expect(suggestionsFor(permessi, null).join(" ")).not.toMatch(/Carichi|Statistiche/);

    // PM in ILIAD, technician in TOWERNET: on a TOWERNET page, the technician's questions.
    const multi = me([
      { templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: false },
      { templateId: "TOWERNET", group: "UT_PE", role: "PE", leader: false },
    ]);
    expect(suggestionsFor(multi, { page: "list", templateId: "TOWERNET" })[0]).toBe("Le pratiche in cui sono indicato come tecnico.");
    expect(suggestionsFor(multi, { page: "list", templateId: "ILIAD" })[0]).toContain("Forecast Ottenimento Permessi");
    // Without a template the questions ask "per cliente".
    expect(suggestionsFor(multi, null).some((s) => s.includes("per cliente"))).toBe(true);

    expect(suggestionsFor(me([], true), null).length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  it("on a sheet, the same questions for everyone", () => {
    const tecnico = me([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]);
    expect(suggestionsFor(tecnico, { page: "sheet", practiceId: "p", templateId: "ILIAD" })).toEqual([
      "Riassumi questa pratica.",
      "Perché non è avanzata, dalle note visibili?",
      "Cosa è cambiato nell'ultima settimana?",
      "Forecast e stato dell'iterazione che sto vedendo.",
    ]);
  });
});
