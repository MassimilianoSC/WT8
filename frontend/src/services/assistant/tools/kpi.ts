/**
 * get_stats, get_workload, find_people (progetto §4.2, §4.4). I numeri vengono dai servizi dell'app (getStats,
 * getWorkload) con le loro regole di accesso: statistiche solo PM del template o ADMIN (PERMESSI non è PM),
 * carichi PM/ADMIN tutti i gruppi e leader il proprio. I KPI escono anche come `facts`: il testo li descrive, non
 * li produce. Semantica preservata: activeTotal/byStato/byGroup/byAssignee sono la situazione attuale,
 * closedInPeriod/leadTime del periodo, upcoming i prossimi 7 giorni del servizio.
 */
import { z } from "zod";
import type { StatsDTO, TemplateId } from "@/lib/contract";
import { visibleTemplates } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { getStats, getWorkload, statsTemplates, workloadGroups } from "@/services/practices-v2/analytics";
import { assignableUsers } from "@/services/users-v2";
import { fitResult, groupIdSchema, MAX_ITEMS, objectIdSchema, periodSchema, roleIdSchema, templateIdSchema, ToolError, type ToolContext, type ToolResult } from "./common";

const forbidden = (e: unknown, msg: string) => {
  if (e instanceof HttpError && e.status === 403) return new ToolError("FORBIDDEN", msg);
  return e;
};

/* ---------- get_stats ---------- */

export const getStatsSchema = z.strictObject({ templateId: templateIdSchema.optional(), period: periodSchema });

/** Capability: l'utente vede statistiche su almeno un template (PM, ADMIN; Direzione a interruttore acceso, D-196). */
export const canUseStats = (ctx: Pick<ToolContext, "user">) => statsTemplates(ctx.user).length > 0;

export async function getStatsTool(ctx: ToolContext, args: z.infer<typeof getStatsSchema>): Promise<ToolResult> {
  if (args.templateId && !statsTemplates(ctx.user).includes(args.templateId)) throw new ToolError("FORBIDDEN", "Statistiche non consentite per questo cliente");
  let s: StatsDTO;
  try {
    s = await getStats(ctx.db, ctx.user, { templateId: args.templateId, from: args.period.from, to: args.period.to }, ctx.now);
  } catch (e) {
    throw forbidden(e, "Statistiche non consentite");
  }
  const src = ctx.sources.add({
    kind: "STATS",
    label: `Statistiche${args.templateId ? ` ${args.templateId}` : ""} dal ${args.period.from} al ${args.period.to}`,
    query: { ...(args.templateId ? { templateId: args.templateId } : {}), from: args.period.from, to: args.period.to },
    readAt: ctx.now.toISOString(),
  });
  const scope = args.templateId ?? "tutti i clienti consentiti";
  const fact = (key: string, label: string, value: number | null, extra: { period?: boolean; unit?: string } = {}) =>
    ctx.facts.add({ key, label, value, scopeLabel: String(scope), ...(extra.unit ? { unit: extra.unit } : {}), ...(extra.period ? { period: args.period } : {}), sourceIndex: src });
  fact("stats.activeTotal", "Pratiche attive", s.activeTotal);
  fact("stats.alertsOpen", "Alert aperti", s.alertsOpen);
  fact("stats.alertsOverdue", "Alert scaduti", s.alertsOverdue);
  fact("stats.upcoming", "Alert in scadenza nei prossimi 7 giorni", s.upcoming.count);
  fact("stats.closed.terminato", "Entrate in TERMINATO nel periodo", s.closedInPeriod.terminato, { period: true });
  fact("stats.closed.ko", "Entrate in KO nel periodo", s.closedInPeriod.ko, { period: true });
  fact("stats.leadTime.mean", "Durata media delle terminate", s.leadTime.meanDays, { period: true, unit: "giorni" });
  fact("stats.leadTime.median", "Durata mediana delle terminate", s.leadTime.medianDays, { period: true, unit: "giorni" });
  // Per gestore: zero esplicito per i template consentiti assenti dalla mappa (S02).
  const allowed: TemplateId[] = args.templateId ? [args.templateId] : statsTemplates(ctx.user);
  const byTemplate = Object.fromEntries(allowed.map((t) => [t, s.byTemplate[t] ?? 0]));
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { ...(args.templateId ? { templateId: args.templateId } : {}), periodo: args.period },
      items: [
        {
          fonte: src,
          periodo: s.period,
          attiveOra: s.activeTotal,
          perStatoOra: s.byStato,
          attivePerCliente: byTemplate,
          attivePerGruppoAbilitato: s.byGroup,
          comparsePerPersona: s.byAssignee.slice(0, MAX_ITEMS),
          comparsePerPersonaTotale: s.byAssignee.length,
          alertAperti: s.alertsOpen,
          alertScaduti: s.alertsOverdue,
          inScadenzaProssimi7Giorni: { totale: s.upcoming.count, primi: s.upcoming.items.slice(0, MAX_ITEMS) },
          chiuseNelPeriodo: s.closedInPeriod,
          durataTerminate: s.leadTime,
          avvertenze: [
            "attiveOra, perStatoOra, attivePerGruppoAbilitato e comparsePerPersona sono la situazione attuale, non del periodo",
            "attivePerGruppoAbilitato e comparsePerPersona possono sommare più del totale (una pratica conta in più gruppi o persone)",
            "inScadenzaProssimi7Giorni usa la finestra fissa del servizio (adesso + 7 giorni)",
          ],
        },
      ],
      complete: s.byAssignee.length <= MAX_ITEMS && s.upcoming.items.length <= MAX_ITEMS,
      truncated: s.byAssignee.length > MAX_ITEMS || s.upcoming.count > MAX_ITEMS,
    },
    10000
  );
}

/* ---------- get_workload ---------- */

export const getWorkloadSchema = z.strictObject({ templateId: templateIdSchema, group: groupIdSchema.optional(), assigneeId: objectIdSchema.optional() });

export const canUseWorkload = (ctx: Pick<ToolContext, "user">) => visibleTemplates(ctx.user).some((t) => workloadGroups(ctx.user, t).length > 0);

export async function getWorkloadTool(ctx: ToolContext, args: z.infer<typeof getWorkloadSchema>): Promise<ToolResult> {
  let items;
  try {
    items = (await getWorkload(ctx.db, ctx.user, { templateId: args.templateId, ...(args.group ? { group: args.group } : {}) })).items;
  } catch (e) {
    throw forbidden(e, "Carichi di lavoro non consentiti per questo gruppo");
  }
  if (args.assigneeId) items = items.filter((i) => i.userId === args.assigneeId);
  const src = ctx.sources.add({
    kind: "WORKLOAD",
    label: `Carichi ${args.templateId}${args.group ? ` ${args.group}` : ""}`,
    query: { templateId: args.templateId, ...(args.group ? { group: args.group } : {}) },
    readAt: ctx.now.toISOString(),
  });
  const shown = items.slice(0, MAX_ITEMS);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { templateId: args.templateId, ...(args.group ? { group: args.group } : {}), ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}), fonte: src },
      items: shown.map((i) => ({ nome: i.name, id: i.userId, gruppo: i.group, ruolo: i.role, praticheAttive: i.activePractices, perStato: i.byStato })),
      total: items.length,
      complete: shown.length === items.length,
      truncated: shown.length < items.length,
      note: "Una riga per appartenenza (persona, gruppo, ruolo): non sommare righe di ruoli diversi come pratiche distinte. Ordine per nome, nessuna classifica.",
    },
    8000
  );
}

/* ---------- find_people ---------- */

export const findPeopleSchema = z.strictObject({ templateId: templateIdSchema, role: roleIdSchema, q: z.string().trim().min(1).max(80).optional() });

export async function findPeople(ctx: ToolContext, args: z.infer<typeof findPeopleSchema>): Promise<ToolResult> {
  if (!visibleTemplates(ctx.user).includes(args.templateId)) throw new ToolError("FORBIDDEN", "Cliente non consentito");
  const q = args.q?.toLocaleLowerCase("it");
  const all = (await assignableUsers(ctx.db, args.templateId, args.role)).filter((u) => !q || u.name.toLocaleLowerCase("it").includes(q));
  const shown = all.slice(0, 10);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { templateId: args.templateId, ruolo: args.role, ...(args.q ? { q: args.q } : {}) },
      items: shown.map((u) => ({ id: u.id, nome: u.name, ruolo: args.role })),
      total: all.length,
      complete: shown.length === all.length,
      truncated: shown.length < all.length,
      ...(all.length > 1 && q ? { note: "Più persone corrispondono: chiedi quale." } : {}),
    },
    2000
  );
}
