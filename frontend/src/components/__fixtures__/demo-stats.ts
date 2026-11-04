/**
 * TEST FIXTURE (cutover D-161): demo statistics and workload, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import { GROUP_IDS, STATI_ATTIVITA, type GroupId, type PraticaSummaryDTO, type RoleId, type StatoAttivita, type StatsDTO, type StatsQuery, type TemplateId, type WorkloadItemDTO } from "@/lib/contract";
import { demoSummaries } from "@/components/__fixtures__/demo-store";
import { STATI_CONCLUSIVI } from "@/components/pratiche/labels";

type PeriodQuery = StatsQuery & { from: string; to: string };


const DEMO_PEOPLE = [
  { userId: "u-pm-1", name: "[demo] Laura Verdi", group: "PM_PERMESSI" as GroupId, role: "PM" as RoleId },
  { userId: "u-pp-1", name: "[demo] Giulia Rossi", group: "PM_PERMESSI" as GroupId, role: "PERMESSI" as RoleId },
  { userId: "u-ut-1", name: "[demo] Marco Bianchi", group: "UT_PE" as GroupId, role: "UT" as RoleId },
  { userId: "u-pe-1", name: "[demo] Sara Gallo", group: "UT_PE" as GroupId, role: "PE" as RoleId },
  { userId: "u-aie-1", name: "[demo] Luca Ferri", group: "AIE" as GroupId, role: "AIE" as RoleId },
  { userId: "u-dl-1", name: "[demo] Paolo Neri", group: "DL" as GroupId, role: "DL" as RoleId },
];

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "it");

function active(p: PraticaSummaryDTO): boolean {
  return !p.archived && !STATI_CONCLUSIVI.includes(p.statoAttivita);
}

/** Demo: a person "appears" in a practice deterministically (no real user fields yet). */
function appears(personIndex: number, p: PraticaSummaryDTO): boolean {
  const n = Number(p.id.replace(/\D/g, "")) || 0;
  return (n + personIndex) % 3 === 0;
}

function mockStats(q: PeriodQuery): StatsDTO {
  const all = demoSummaries().filter((p) => !q.templateId || p.templateId === q.templateId);
  const notArchived = all.filter((p) => !p.archived);
  const act = all.filter(active);
  const byStato = Object.fromEntries(STATI_ATTIVITA.map((s) => [s, notArchived.filter((p) => p.statoAttivita === s).length])) as Record<StatoAttivita, number>;
  const byTemplate: Partial<Record<TemplateId, number>> = {};
  for (const p of act) byTemplate[p.templateId] = (byTemplate[p.templateId] ?? 0) + 1;
  const byGroup = Object.fromEntries(GROUP_IDS.map((g) => [g, act.filter((p) => p.enabledGroups.includes(g)).length])) as Record<GroupId, number>;
  const byAssignee = DEMO_PEOPLE.map((u, i) => ({ userId: u.userId, name: u.name, count: act.filter((p) => appears(i, p)).length }))
    .filter((a) => a.count > 0)
    .sort(byName);
  const alertsOpen = act.reduce((n, p) => n + p.openAlerts, 0);
  const inPeriod = (iso: string) => iso.slice(0, 10) >= q.from && iso.slice(0, 10) <= q.to;
  const upcomingItems = act
    .filter((p) => p.openAlerts > 0)
    .slice(0, 6)
    .map((p, i) => {
      const due = new Date(`${q.to}T09:00:00`);
      due.setDate(due.getDate() + 1 + i);
      return {
        practiceId: p.id,
        codiceSito: p.codiceSito,
        templateId: p.templateId,
        rule: "SOPRALLUOGO",
        label: "[demo] Data sopralluogo da compilare",
        dueAt: due.toISOString(),
      };
    });
  const closed = all.filter((p) => inPeriod(p.updatedAt));
  return {
    period: { from: q.from, to: q.to },
    activeTotal: act.length,
    byStato,
    byTemplate,
    byGroup,
    byAssignee,
    alertsOpen,
    alertsOverdue: Math.floor(alertsOpen / 3),
    upcoming: { count: upcomingItems.length, items: upcomingItems },
    closedInPeriod: {
      terminato: closed.filter((p) => p.statoAttivita === "TERMINATO").length,
      ko: closed.filter((p) => p.statoAttivita === "KO").length,
    },
    leadTime: { count: 4, meanDays: 96.5, medianDays: 88 },
  };
}

function mockWorkload(templateId: TemplateId, group?: GroupId): WorkloadItemDTO[] {
  const act = demoSummaries().filter((p) => p.templateId === templateId && active(p));
  return DEMO_PEOPLE.map((u, i) => ({ u, i }))
    .filter(({ u }) => !group || u.group === group)
    .map(({ u, i }) => {
      const mine = act.filter((p) => appears(i, p));
      const byStato: Partial<Record<StatoAttivita, number>> = {};
      for (const p of mine) byStato[p.statoAttivita] = (byStato[p.statoAttivita] ?? 0) + 1;
      return { userId: u.userId, name: u.name, templateId, group: u.group, role: u.role, activePractices: mine.length, byStato };
    })
    .sort(byName);
}

/** Same signatures as stats-source. */
export const demoStats = { loadStats: async (q: PeriodQuery) => mockStats(q), loadWorkload: async (t: TemplateId, g?: GroupId) => mockWorkload(t, g) };
