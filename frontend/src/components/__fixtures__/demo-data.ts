/**
 * TEST FIXTURE (cutover D-161): demo data from mock-data.ts, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import {
  GROUP_IDS,
  STATI_ATTIVITA,
  type GroupId,
  type PraticaSummaryDTO,
  type TemplateId,
  type TemplateSummaryDTO,
} from "@/lib/contract";

/** Demo data typed on the contract, used until the v2 API (B5) exists. */

export const MOCK_TEMPLATES: TemplateSummaryDTO[] = [
  { id: "ILIAD", label: "ILIAD", baseline: "2026-10-08" },
  { id: "TOWERNET", label: "TOWERNET", baseline: "2026-10-08" },
  { id: "TIM_FIBERCOP", label: "TIM / FIBERCOP", baseline: "2026-10-08" },
  { id: "INWIT", label: "INWIT", baseline: "2026-10-08" },
  { id: "FASTWEB_VODAFONE", label: "FASTWEB-VODAFONE", baseline: "2026-10-08" },
  { id: "LEONARDO", label: "LEONARDO", baseline: "2026-10-08" },
];

const COMMITTENTI = ["TODOS", "TELEBIT", "SIRTI"];
const CLIENTE_FINALE: Record<TemplateId, string> = {
  ILIAD: "ILIAD",
  TOWERNET: "TOWERNET",
  TIM_FIBERCOP: "TIM_FIBERCOP",
  INWIT: "INWIT",
  FASTWEB_VODAFONE: "VODAFONE",
  LEONARDO: "LEONARDO",
};
const COMUNI = ["Milano", "Torino", "Bologna", "Firenze", "Roma", "Napoli", "Bari", "Palermo", "Genova", "Verona"];
const TOTALS: Record<GroupId, number> = { PM_PERMESSI: 72, UT_PE: 32, AIE: 15, DL: 12 };

function practice(i: number): PraticaSummaryDTO {
  const tpl = MOCK_TEMPLATES[i % MOCK_TEMPLATES.length].id;
  const stato = STATI_ATTIVITA[(i * 7) % STATI_ATTIVITA.length];
  const enabled: GroupId[] = ["PM_PERMESSI"];
  if (stato !== "CREATA") {
    if (i % 2 === 0) enabled.push("UT_PE");
    if (i % 3 === 0) enabled.push("AIE");
    if (i % 4 === 0) enabled.push("DL");
  }
  const progress = Object.fromEntries(
    GROUP_IDS.map((g) => {
      const total = TOTALS[g];
      const filled = enabled.includes(g) ? Math.min(total, Math.round(total * (((i * 13 + g.length * 5) % 10) / 10))) : 0;
      return [g, { filled, total }];
    })
  ) as Record<GroupId, { filled: number; total: number }>;
  const day = String(1 + ((i * 3) % 28)).padStart(2, "0");
  const month = String(1 + (i % 9)).padStart(2, "0");
  const comune = COMUNI[i % COMUNI.length];
  const archived = (stato === "TERMINATO" || stato === "KO") && i % 3 !== 0;

  return {
    id: `mock-${i}`,
    templateId: tpl,
    codiceSito: `${comune.slice(0, 2).toUpperCase()}${String(1000 + i * 37).slice(-4)}`,
    nomeSito: `${comune} ${["Centro", "Nord", "Stazione", "Porto", "Zona Ind."][i % 5]}`,
    committente: { code: COMMITTENTI[i % COMMITTENTI.length] },
    clienteFinale: { code: CLIENTE_FINALE[tpl] },
    codiceG7: i % 6 === 5 ? null : String(400000 + i * 113),
    iteration: i % 9 === 0 ? 2 : 1,
    statoAttivita: stato,
    enabledGroups: enabled,
    // Some closed practices are already in the archive (D-28).
    archived,
    archivedAt: archived ? `2026-${month}-${day}T18:00:00+02:00` : null,
    originPracticeId: i % 11 === 10 ? `mock-${i - 1}` : null,
    openAlerts: i % 5 === 0 ? (i % 3) + 1 : 0,
    progress,
    createdAt: `2026-${month}-${day}T09:00:00+02:00`,
    updatedAt: `2026-${month}-${day}T17:30:00+02:00`,
  };
}

export const MOCK_PRATICHE: PraticaSummaryDTO[] = Array.from({ length: 48 }, (_, i) => practice(i));
