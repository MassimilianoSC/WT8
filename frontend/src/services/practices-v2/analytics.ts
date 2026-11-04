/**
 * Statistiche (contratto §9, D-48) e carichi di lavoro (§10, D-23) sul database _v2. Sola lettura.
 * GET /api/stats è in collisione con la beta ed entra al cutover; GET /api/workload è nuova e già pubblicata.
 *
 * Pratica attiva = non archiviata e con Stato attività diverso da TERMINATO e KO. Le persone "compaiono" in una
 * pratica tramite i campi utente dell'iterazione corrente (D-39), anche se nascosti per condizione (D-31).
 * Ordinamenti per nome, mai per numero (nessuna classifica, G §17.13).
 */
import { ObjectId, type Db } from "mongodb";
import {
  GROUP_IDS,
  STATI_ATTIVITA,
  TEMPLATE_IDS,
  type GroupId,
  type RoleId,
  type StatoAttivita,
  type StatsDTO,
  type StatsQuery,
  type TemplateId,
  type UserDTO,
  type WorkloadItemDTO,
  type WorkloadResponse,
} from "@/lib/contract";
import { addCalendarDays, diffCalendarDays, isValidIsoDate, romeDate } from "@/lib/calendario";
import { canSeePractice } from "@/lib/engines/access";
import { STATE_RULES } from "@/lib/engines/state";
import { isDirezione } from "@/lib/features";
import { HttpError } from "@/lib/http-error";
import { assigneesOf, userFields } from "@/lib/practice/assignees";
import { ALERT_RULES, store } from "@/lib/store/db";
import type { IterationDoc, PracticeDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { CLOSED_STATI } from "@/services/practices-v2/list";

export const STATS_DEFAULT_DAYS = 30;
export const UPCOMING_DAYS = 7;
export const UPCOMING_MAX_ITEMS = 50;

const isActiveUser = (u: UserDTO) => u.status === "active";

/** Template in cui l'utente ha il ruolo PM (ADMIN: tutti): statistiche, carichi di tutti i gruppi, export (D-23). */
export function pmTemplates(u: UserDTO): TemplateId[] {
  if (!isActiveUser(u)) return [];
  if (u.isAdmin) return [...TEMPLATE_IDS];
  return TEMPLATE_IDS.filter((t) => u.memberships.some((m) => m.templateId === t && m.role === "PM"));
}

/**
 * Template delle Statistiche (§9): quelli da PM (o tutti per l'ADMIN) e, con il permesso Direzione (§15.2, D-193),
 * tutti in sola lettura. L'export resta su pmTemplates: la Direzione non lo ha in più.
 */
export function statsTemplates(u: UserDTO): TemplateId[] {
  const pm = pmTemplates(u);
  return isDirezione(u) ? [...TEMPLATE_IDS] : pm;
}

const templateParam = (raw: string | null): TemplateId | undefined => {
  if (raw === null || raw === "") return undefined;
  if (!(TEMPLATE_IDS as readonly string[]).includes(raw)) throw new HttpError("Parametro templateId non valido", 400);
  return raw as TemplateId;
};

/* ---------- caricamento ---------- */

interface Current {
  practice: PracticeDoc;
  iteration: Pick<IterationDoc, "_id" | "values">;
  rows: Array<{ groupKey: string; values: IterationDoc["values"] }>;
}

/** Iterazioni correnti (valori) e righe dei gruppi ripetibili con campi utente. */
async function loadCurrent(db: Db, practices: PracticeDoc[]): Promise<Current[]> {
  if (practices.length === 0) return [];
  const ids = practices.map((p) => p.currentIterationId);
  const groups = [...new Set(TEMPLATE_IDS.flatMap((t) => userFields(COMPILED_TEMPLATES[t].template).map((o) => o.repeatGroup).filter((g): g is string => !!g)))];
  const [iterations, rows] = await Promise.all([
    store.iterations(db).find({ _id: { $in: ids } }, { projection: { _id: 1, values: 1 } }).toArray(),
    groups.length
      ? store.repeatRows(db).find({ iterationId: { $in: ids }, groupKey: { $in: groups } }, { projection: { iterationId: 1, groupKey: 1, values: 1 } }).toArray()
      : Promise.resolve([]),
  ]);
  const itById = new Map(iterations.map((i) => [i._id.toHexString(), i]));
  const rowsBy = new Map<string, Current["rows"]>();
  for (const r of rows) {
    const k = r.iterationId.toHexString();
    if (!rowsBy.has(k)) rowsBy.set(k, []);
    rowsBy.get(k)!.push({ groupKey: r.groupKey, values: r.values });
  }
  return practices.flatMap((p) => {
    const it = itById.get(p.currentIterationId.toHexString());
    return it ? [{ practice: p, iteration: it, rows: rowsBy.get(p.currentIterationId.toHexString()) ?? [] }] : [];
  });
}

const activeFilter = (templates: TemplateId[]) => ({
  templateId: { $in: templates },
  archived: false,
  "currentSummary.statoAttivita": { $nin: [...CLOSED_STATI] },
});

/* ---------- §9 statistiche ---------- */

/** ?templateId=&from=&to= (400 se non validi); periodo predefinito: ultimi 30 giorni fino a oggi (Roma). */
export function parseStatsQuery(params: URLSearchParams, now: Date = new Date()): Required<Pick<StatsQuery, "from" | "to">> & StatsQuery {
  const date = (name: string) => {
    const v = params.get(name);
    if (v === null || v === "") return undefined;
    if (!isValidIsoDate(v)) throw new HttpError(`Parametro ${name} non valido (AAAA-MM-GG)`, 400);
    return v;
  };
  const to = date("to") ?? romeDate(now);
  const from = date("from") ?? addCalendarDays(to, -STATS_DEFAULT_DAYS);
  if (from > to) throw new HttpError("Il periodo inizia dopo la fine", 400);
  return { templateId: templateParam(params.get("templateId")), from, to };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function getStats(db: Db, user: UserDTO, q: Required<Pick<StatsQuery, "from" | "to">> & StatsQuery, now: Date = new Date()): Promise<StatsDTO> {
  const allowed = statsTemplates(user);
  if (allowed.length === 0 || (q.templateId && !allowed.includes(q.templateId))) throw new HttpError("Statistiche riservate a PM e ADMIN", 403);
  const templates = q.templateId ? [q.templateId] : allowed;

  const notArchived = await store.practices(db).find({ templateId: { $in: templates }, archived: false }).toArray();
  const active = notArchived.filter((p) => !CLOSED_STATI.includes(p.currentSummary.statoAttivita));

  const byStato = Object.fromEntries(STATI_ATTIVITA.map((s) => [s, 0])) as Record<StatoAttivita, number>;
  for (const p of notArchived) byStato[p.currentSummary.statoAttivita]++;
  const byTemplate: Partial<Record<TemplateId, number>> = {};
  for (const p of active) byTemplate[p.templateId] = (byTemplate[p.templateId] ?? 0) + 1;
  const byGroup = Object.fromEntries(GROUP_IDS.map((g) => [g, active.filter((p) => p.enabledGroups.includes(g)).length])) as Record<GroupId, number>;

  // Persone nei campi utente delle pratiche attive.
  const counts = new Map<string, number>();
  for (const c of await loadCurrent(db, active)) {
    for (const userId of assigneesOf(COMPILED_TEMPLATES[c.practice.templateId].template, c.iteration.values, c.rows).keys()) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }
  const names = await userNames(db, [...counts.keys()]);
  const byAssignee = [...counts]
    .map(([userId, count]) => ({ userId, name: names.get(userId) ?? "(utente non trovato)", count }))
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.userId.localeCompare(b.userId));

  // Alert OPEN e ACTIVE delle iterazioni correnti delle pratiche non archiviate.
  const currentIds = notArchived.map((p) => p.currentIterationId);
  const alerts = await store.alerts(db).find({ iterationId: { $in: currentIds }, status: "OPEN", executionStatus: "ACTIVE" }).toArray();
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);
  const upcomingAll = alerts.filter((a) => a.dueAt && a.dueAt > now && a.dueAt <= horizon).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
  const practiceById = new Map(notArchived.map((p) => [p._id.toHexString(), p]));
  const ruleLabel = (ruleId: string) => ALERT_RULES.find((r) => r.ruleId === ruleId)?.label ?? ruleId;

  // Ingressi in TERMINATO / KO nel periodo (eventi STATO), archiviate comprese.
  const inTemplates = await store.practices(db).find({ templateId: { $in: templates } }, { projection: { _id: 1, templateId: 1 } }).toArray();
  const templateOf = new Map(inTemplates.map((p) => [p._id.toHexString(), p.templateId]));
  const objectIdOf = new Map(inTemplates.map((p) => [p._id.toHexString(), p._id]));
  const closingEvents = await store.events(db)
    .find({ practiceId: { $in: inTemplates.map((p) => p._id) }, kind: "STATO", "structuredDetail.to": { $in: ["TERMINATO", "KO"] } })
    .sort({ timestamp: 1 })
    .toArray();
  const lastEntry = new Map<string, { TERMINATO?: string; KO?: string }>();
  for (const e of closingEvents) {
    const day = romeDate(e.timestamp);
    if (day < q.from || day > q.to) continue;
    const k = e.practiceId.toHexString();
    const to = (e.structuredDetail as { to: "TERMINATO" | "KO" }).to;
    lastEntry.set(k, { ...lastEntry.get(k), [to]: day });
  }
  const terminated = [...lastEntry].filter(([, v]) => v.TERMINATO);

  // Lead time: dalla prima Data assegnazione (prima iterazione) all'ultimo TERMINATO del periodo.
  const firstIterations = await store.iterations(db)
    .find({ practiceId: { $in: terminated.map(([k]) => objectIdOf.get(k)!) }, n: 1 }, { projection: { practiceId: 1, values: 1 } })
    .toArray();
  const days: number[] = [];
  for (const it of firstIterations) {
    const k = it.practiceId.toHexString();
    const rule = STATE_RULES.rules.find((r) => r.templateId === templateOf.get(k) && r.status === "ASSEGNATO" && !r.repeatGroup);
    const start = rule ? it.values[rule.dateFlowId] : null;
    const end = lastEntry.get(k)?.TERMINATO;
    if (typeof start === "string" && isValidIsoDate(start) && end && start <= end) days.push(diffCalendarDays(start, end));
  }

  return {
    period: { from: q.from, to: q.to },
    activeTotal: active.length,
    byStato,
    byTemplate,
    byGroup,
    byAssignee,
    alertsOpen: alerts.length,
    alertsOverdue: alerts.filter((a) => a.dueAt && a.dueAt < now).length,
    upcoming: {
      count: upcomingAll.length,
      items: upcomingAll.slice(0, UPCOMING_MAX_ITEMS).map((a) => {
        const p = practiceById.get(a.practiceId.toHexString())!;
        return {
          practiceId: p._id.toHexString(),
          codiceSito: p.currentSummary.codiceSito,
          templateId: p.templateId,
          rule: a.ruleId,
          label: ruleLabel(a.ruleId),
          dueAt: a.dueAt!.toISOString(),
          // §15.2 (D-193): la Direzione vede scadenze di template di cui non apre le schede.
          canOpen: canSeePractice(user, p),
        };
      }),
    },
    closedInPeriod: {
      terminato: terminated.length,
      ko: [...lastEntry.values()].filter((v) => v.KO).length,
    },
    leadTime: {
      count: days.length,
      meanDays: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
      medianDays: median(days),
    },
  };
}

async function userNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const valid = ids.filter((id) => /^[0-9a-f]{24}$/i.test(id));
  if (valid.length === 0) return new Map();
  const users = await store.users(db).find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray();
  return new Map(users.map((u) => [u._id.toHexString(), u.name]));
}

/* ---------- §10 carichi di lavoro ---------- */

export function parseWorkloadQuery(params: URLSearchParams): { templateId: TemplateId; group?: GroupId } {
  const templateId = templateParam(params.get("templateId"));
  if (!templateId) throw new HttpError("templateId obbligatorio", 400);
  const g = params.get("group");
  if (g !== null && g !== "" && !(GROUP_IDS as readonly string[]).includes(g)) throw new HttpError("Parametro group non valido", 400);
  return { templateId, ...(g ? { group: g as GroupId } : {}) };
}

/**
 * Gruppi di cui l'utente vede i carichi nel template: tutti per PM e ADMIN e per la Direzione a interruttore acceso
 * (§15.2, D-193), il proprio per il team leader (D-23).
 */
export function workloadGroups(u: UserDTO, templateId: TemplateId): GroupId[] {
  if (pmTemplates(u).includes(templateId) || isDirezione(u)) return [...GROUP_IDS];
  if (!isActiveUser(u)) return [];
  return GROUP_IDS.filter((g) => u.memberships.some((m) => m.templateId === templateId && m.group === g && m.leader));
}

export async function getWorkload(db: Db, user: UserDTO, q: { templateId: TemplateId; group?: GroupId }): Promise<WorkloadResponse> {
  // §15.2 (D-193, D-196): la Direzione legge i carichi di tutti i gruppi di tutti i template, anche dall'assistente.
  const allowed = workloadGroups(user, q.templateId);
  if (allowed.length === 0 || (q.group && !allowed.includes(q.group))) throw new HttpError("Carichi di lavoro non consentiti per questo gruppo", 403);
  const groups = q.group ? [q.group] : allowed;

  const people = await store.users(db)
    .find({ status: "active", memberships: { $elemMatch: { templateId: q.templateId, group: { $in: groups } } } }, { projection: { name: 1, memberships: 1 } })
    .toArray();
  const current = await loadCurrent(db, await store.practices(db).find(activeFilter([q.templateId])).toArray());
  const template = COMPILED_TEMPLATES[q.templateId].template;
  const appearances = current.map((c) => ({ stato: c.practice.currentSummary.statoAttivita, who: assigneesOf(template, c.iteration.values, c.rows) }));

  const items: WorkloadItemDTO[] = [];
  for (const u of people) {
    const id = u._id.toHexString();
    for (const m of u.memberships.filter((x) => x.templateId === q.templateId && groups.includes(x.group))) {
      const mine = appearances.filter((a) => a.who.get(id)?.has(m.role as RoleId));
      const byStato: Partial<Record<StatoAttivita, number>> = {};
      for (const a of mine) byStato[a.stato] = (byStato[a.stato] ?? 0) + 1;
      items.push({ userId: id, name: u.name, templateId: q.templateId, group: m.group, role: m.role, activePractices: mine.length, byStato });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "it") || a.userId.localeCompare(b.userId) || a.role.localeCompare(b.role));
  return { items };
}
