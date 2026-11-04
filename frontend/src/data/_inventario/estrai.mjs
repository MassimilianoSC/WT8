#!/usr/bin/env node
/**
 * Inventario pre-B2 — sola estrazione, nessuna logica applicativa.
 *
 * Legge i sei ASSOCIAZIONI_CAMPI_*.md della baseline e LISTE_VALORI_INIZIALI.csv e produce,
 * nella cartella di questo script, quattro CSV da validare prima del compilatore dei template:
 *   condizioni.csv · dtype.csv · master_mirror.csv · ripetibili_liste.csv
 * Ogni deduzione riporta la parola chiave o la regola usata; i casi dubbi sono marcati
 * (DA_TRADURRE / AMBIGUO / INCERTO) e non vengono mai risolti "a indovinare".
 *
 * Uso (dalla root del repository):  node frontend/src/data/_inventario/estrai.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const BASELINE = path.join(ROOT, "docs/baseline/2026-10-08");
const LISTE_CSV = path.join(ROOT, "docs/baseline/derivati/LISTE_VALORI_INIZIALI.csv");

const TEMPLATE_BY_FILE = {
  ILIAD: "ILIAD",
  TOWERNET: "TOWERNET",
  "TIM-FIBERCOP": "TIM_FIBERCOP",
  INWIT: "INWIT",
  "FASTWEB-VODAFONE": "FASTWEB_VODAFONE",
  LEONARDO: "LEONARDO",
};
const GROUP_BY_TEAM = { "PM/Permessi": "PM_PERMESSI", "UT+PE": "UT_PE", AIE: "AIE", DL: "DL" };

/* ---------- utilità ---------- */

/** Normalizza un'etichetta per i confronti: minuscole, senza accenti, virgolette, parentesi e punteggiatura. */
function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[“”"'`’]/g, "")
    .replace(/[^a-z0-9°%+]+/g, " ")
    .trim();
}
const unquote = (s) => String(s).replace(/[“”"`]/g, "").trim();
const snake = (s) =>
  norm(s).replace(/[°%+]/g, " ").trim().replace(/\s+/g, "_").toUpperCase();

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(name, header, rows) {
  const lines = [header.join(";"), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(";"))];
  fs.writeFileSync(path.join(HERE, name), "﻿" + lines.join("\n") + "\n", "utf8");
  return rows.length;
}
function parseCsvSemicolon(text) {
  const out = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

/* ---------- lettura sorgenti ---------- */

const occ = []; // tutte le occorrenze dei sei MD
for (const f of fs.readdirSync(BASELINE).filter((f) => f.startsWith("ASSOCIAZIONI_CAMPI_")).sort()) {
  const template = TEMPLATE_BY_FILE[f.replace("ASSOCIAZIONI_CAMPI_", "").replace(".md", "")];
  if (!template) throw new Error(`Template sconosciuto per ${f}`);
  for (const line of fs.readFileSync(path.join(BASELINE, f), "utf8").split(/\r?\n/)) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (c.length !== 10) throw new Error(`${f}: riga con ${c.length} colonne: ${line.slice(0, 80)}`);
    occ.push({
      template, file: f, riga: Number(c[0]), team: c[1], group: GROUP_BY_TEAM[c[1]] ?? `?${c[1]}`,
      sezione: c[2], label: c[3], dtype: c[4], flowId: c[5], universale: c[6], confidenza: c[7],
      nota: c[8], cond: c[9],
    });
  }
}

const [listHeader, ...listRows] = parseCsvSemicolon(fs.readFileSync(LISTE_CSV, "utf8").replace(/^﻿/, ""));
const liste = listRows
  .filter((r) => r.length >= 6)
  .map((r) => Object.fromEntries(listHeader.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
// campo della lista → { tipo, valori } per gestore ("TUTTI" = comune)
const listIndex = new Map(); // key `${gestore}|${norm(campo)}`
for (const l of liste) {
  const names = new Set([norm(l.campo), ...l.campo.split(" / ").map(norm)]);
  for (const n of names) {
    const k = `${l.gestore}|${n}`;
    if (!listIndex.has(k)) listIndex.set(k, { campo: l.campo, tipo: l.tipo_lista, valori: [] });
    listIndex.get(k).valori.push({ valore: l.valore, codice: l.codice_proposto });
  }
}
const findList = (template, label) =>
  listIndex.get(`${template}|${norm(label)}`) ?? listIndex.get(`TUTTI|${norm(label)}`) ?? null;
// Campi che usano il dominio SI/NO comune (nota "Usato da: …" della lista SI / NO)
const siNoRow = liste.find((l) => /^SI \/ NO/.test(l.campo));
const SI_NO_FIELDS = new Set(
  (siNoRow?.note.match(/Usato da:\s*(.*)$/)?.[1] ?? "").split(",").map((s) => norm(s)).filter(Boolean)
);

/* ---------- indici per template ---------- */

const byTemplate = new Map();
for (const o of occ) {
  if (!byTemplate.has(o.template)) byTemplate.set(o.template, []);
  byTemplate.get(o.template).push(o);
}
const byFlow = (template) => {
  const m = new Map();
  for (const o of byTemplate.get(template)) {
    if (!m.has(o.flowId)) m.set(o.flowId, []);
    m.get(o.flowId).push(o);
  }
  return m;
};
const FLOWS = new Map([...byTemplate.keys()].map((t) => [t, byFlow(t)]));

/* ---------- 1. master / mirror / pop-up ---------- */

const MIRROR_RX = [
  [/\bmirror\b/i, "mirror"],
  [/sola visualizzazione/i, "sola visualizzazione"],
  [/sola lettura/i, "sola lettura"],
  [/\bpop-up\b/i, "pop-up"],
  [/ereditato da/i, "ereditato da"],
];
const MASTER_RX = /\bmaster\b/i;
const isExplicitMaster = (o) => MASTER_RX.test(o.nota) && !/mirror di/i.test(o.nota);

function mirrorKeyword(o) {
  const text = `${o.nota} ${o.cond}`;
  // Una nota che dichiara "master" (es. "master PM con mirror PE", "Campo master …; alimenta … in sola
  // visualizzazione") descrive QUESTA occorrenza come master: le parole di mirror riguardano l'altra.
  if (isExplicitMaster(o)) return null;
  for (const [rx, kw] of MIRROR_RX) if (rx.test(text)) return kw;
  return null;
}
function popupOf(o) {
  const m = o.nota.match(/\bPop-up\s+([^;.]+?)\s*(?:[;.]|$)/i);
  if (!m) return null;
  const label = `Pop-up ${m[1].trim()}`;
  const src = /PM/i.test(m[1]) ? "PM_PERMESSI" : /UT|PE/i.test(m[1]) ? "UT_PE" : /AIE/i.test(m[1]) ? "AIE" : /DL/i.test(m[1]) ? "DL" : "?";
  return { label, sourceGroup: src };
}
const mirrorOfLabel = (o) => o.nota.match(/mirror di\s*`([^`]+)`/i)?.[1] ?? "";

const roleOf = new Map(); // `${template}|${riga}` → { ruolo, ambiguo }
const mmRows = [];
for (const [template, flows] of FLOWS) {
  for (const [flowId, list] of flows) {
    const kws = list.map(mirrorKeyword);
    const singleWithMirror = list.length === 1 && kws[0];
    if (list.length === 1 && !singleWithMirror) {
      roleOf.set(`${template}|${list[0].riga}`, { ruolo: "MASTER", ambiguo: false });
      continue;
    }
    let master = null, motivo = "";
    const notMirror = list.filter((_, i) => !kws[i]);
    const explicit = list.filter(isExplicitMaster);
    if (singleWithMirror) motivo = "unica occorrenza ma marcata come mirror/pop-up: master assente nel template";
    else if (notMirror.length === 1) master = notMirror[0];
    else if (explicit.length === 1) master = explicit[0];
    else if (notMirror.length === 0) motivo = "tutte le occorrenze sono marcate come mirror/pop-up";
    else motivo = `${notMirror.length} occorrenze senza parola chiave di mirror (nessun master esplicito)`;

    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const isMaster = master === o;
      const ruolo = master ? (isMaster ? "MASTER" : "MIRROR") : kws[i] ? "MIRROR?" : "?";
      const pop = popupOf(o);
      const mof = mirrorOfLabel(o);
      const notes = [];
      if (mof && master && norm(mof) !== norm(master.label)) notes.push(`'mirror di' cita "${mof}" ma il master si chiama "${master.label}"`);
      if (master && !isMaster && master.group === o.group) notes.push("mirror nello stesso gruppo del master");
      if (isMaster && pop) notes.push("il master risulta dentro un pop-up");
      if (isMaster && /sola visualizzazione/i.test(o.cond)) notes.push("il master ha 'sola visualizzazione' nella colonna condizione");
      roleOf.set(`${template}|${o.riga}`, { ruolo, ambiguo: !master });
      mmRows.push({
        template, flowId, riga: o.riga, gruppo: o.group, sezione: o.sezione, etichetta: o.label,
        ruolo_dedotto: ruolo,
        parola_chiave: isMaster
          ? (isExplicitMaster(o) ? "master (esplicito)" : "unica occorrenza senza parola chiave di mirror")
          : (kws[i] ?? ""),
        mirror_di: mof, popup_label: pop?.label ?? "", popup_gruppo_sorgente: pop?.sourceGroup ?? "",
        ambiguo: master ? (notes.length ? "VERIFICARE" : "NO") : "SI",
        motivo: [motivo, ...notes].filter(Boolean).join(" · "),
        nota_md: o.nota,
      });
    }
  }
}
const masterOf = (template, flowId) => {
  const list = FLOWS.get(template).get(flowId);
  return list.find((o) => roleOf.get(`${template}|${o.riga}`)?.ruolo === "MASTER") ?? list[0];
};

/* ---------- 2. dtype ---------- */

const USER_FIELDS = new Map([
  ["tecnico pp", "PERMESSI"], ["tecnico aie", "AIE"], ["responsabile interno aie", "AIE"],
  ["tecnico ut", "UT"], ["vs as incaricata da", "UT"], ["tecnico caratterizzazione", "UT"],
  ["tecnico pe", "PE"], ["pe incaricato da", "PE"], ["tecnico psc", "PE"], ["tecnico deposito sismico", "DL"],
]); // D-39

function dataTypeFor(o) {
  const d = norm(o.dtype), l = norm(o.label);
  const userRole = USER_FIELDS.get(l);
  const multiTech = /piu tecnici/.test(norm(o.cond));
  if (userRole) return { type: multiTech ? "USERS" : "USER", regola: `campo utente D-39 (${userRole})`, userRole };
  if (!d) return { type: "TEXT", regola: "dtype vuoto → TEXT (segnalato)", warn: "dtype vuoto" };
  if (d.startsWith("date")) return { type: "DATE", regola: "DATE" };
  if (/selezione multipla/.test(d)) return { type: "MULTISELECT", regola: "menù a selezione multipla" };
  if (/menu a tendina/.test(d)) return { type: "SELECT", regola: "menù a tendina" };
  if (d === "integer" && /codice g7/.test(l)) return { type: "TEXT", regola: "INTEGER ma Codice G7 è un codice (D-24): TEXT" };
  if (/^n° (protocollo|sismica)/.test(l) || /^n (protocollo|sismica)/.test(l)) return { type: "TEXT", regola: "N° protocollo / N° sismica = testo (D-38)" };
  if (["integer", "decimal", "campo numerico"].includes(d)) return { type: "NUMBER", regola: o.dtype };
  if (/libero/.test(d)) return /^note\b/.test(l)
    ? { type: "LONGTEXT", regola: "campo libero di tipo Note → LONGTEXT" }
    : { type: "TEXT", regola: "campo libero → TEXT" };
  if (d === "text" || /varchar/.test(d)) return { type: "TEXT", regola: o.dtype };
  return { type: "TEXT", regola: "forma non riconosciuta → TEXT (segnalato)", warn: `dtype non riconosciuto: ${o.dtype}` };
}

const dtypeAgg = new Map();
for (const o of occ) {
  const key = o.dtype || "(vuoto)";
  if (!dtypeAgg.has(key)) dtypeAgg.set(key, { forma: key, conteggio: 0, per_tipo: new Map(), esempi: new Map() });
  const a = dtypeAgg.get(key);
  a.conteggio++;
  const { type, regola } = dataTypeFor(o);
  a.per_tipo.set(type, (a.per_tipo.get(type) ?? 0) + 1);
  const k = `${type}: ${regola}`;
  if (!a.esempi.has(k)) a.esempi.set(k, new Set());
  if (a.esempi.get(k).size < 4) a.esempi.get(k).add(o.label);
}
const DTYPE_BASE = {
  "DATE (gg/mm/aaaa)": "DATE", "menù a tendina": "SELECT", "Menù a tendina": "SELECT", TEXT: "TEXT",
  "menù a tendina che si popola volta per volta": "SELECT (lista CONFIGURABLE; USER/USERS per i campi D-39)",
  "campo libero": "TEXT / LONGTEXT (Note)", libero: "TEXT / LONGTEXT (Note)", "campo numerico": "NUMBER",
  DECIMAL: "NUMBER", INTEGER: "NUMBER (Codice G7 → TEXT)", "campo varchar 50": "TEXT", "campo varchar": "TEXT",
  "menù a tendina con tutti i clienti": "SELECT", "menù a tendina a scelta singola": "SELECT",
  "menù a tendina con selezione multipla": "MULTISELECT", "(vuoto)": "TEXT (segnalato)",
};

/* ---------- 3. condizioni ---------- */

function splitParts(text) {
  return text
    .split(";")
    .flatMap((p) => p.split(/\.\s+(?=[A-ZÀ-Ú<>])/))
    .flatMap((p) => p.split("→"))
    .map((p) => p.trim().replace(/\.$/, "").trim())
    .filter(Boolean);
}
function classify(p) {
  if (/^(non )?(compare|appare)\b|^compare\/si crea/i.test(p)) return "VISIBILITA";
  if (/sola visualizzazione/i.test(p)) return "SOLA_VISUALIZZAZIONE";
  if (/^valori:/i.test(p)) return "VALORI";
  if (/\balert\b/i.test(p)) return "ALERT";
  if (/giorni|forecast manuale|formula|ricalcolo/i.test(p)) return "FORMULA";
  if (/data del giorno|si compila automaticamente|possibilita di modificare|possibilità di modificare/i.test(p)) return "VALORE_PREDEFINITO";
  if (/nessuno/i.test(p)) return "VALORE_NESSUNO";
  if (/piu tecnici|più tecnici|piu oda|più oda|per ogni oda/i.test(p)) return "RIPETIZIONE";
  if (/compilat[oi] da|compilano/i.test(p)) return "COMPILATO_DA";
  if (/,/.test(p) && p.length < 40) return "VALORI";
  return "ALTRO";
}

/** Cerca il flowId di un'etichetta citata da una condizione, nel template. */
function resolveLabel(template, label, preferSelect) {
  const n = norm(label);
  let hits = byTemplate.get(template).filter((o) => norm(o.label) === n);
  let how = "esatta";
  if (!hits.length) {
    hits = byTemplate.get(template).filter((o) => norm(o.label).startsWith(n + " ") || n.startsWith(norm(o.label) + " "));
    how = "parziale";
  }
  let ids = [...new Set(hits.map((o) => o.flowId))];
  if (ids.length > 1 && preferSelect) {
    const sel = ids.filter((id) => ["SELECT", "MULTISELECT"].includes(dataTypeFor(masterOf(template, id)).type));
    if (sel.length === 1) { ids = sel; how += ", scelto il campo a menù tra omonimi"; }
  }
  return { ids, how };
}
function valueCode(template, label, value) {
  const v = norm(value);
  if (v === "si" || v === "no") return { code: v.toUpperCase(), how: "dominio SI/NO" };
  const l = findList(template, label);
  const hit = l?.valori.find((x) => norm(x.valore) === v);
  if (hit) return { code: hit.codice, how: `lista ${l.campo}` };
  if (/^regione$/.test(norm(label))) return { code: snake(value), how: "codice ISTAT da risolvere in B6", warn: true };
  return { code: snake(value), how: "codice dedotto (valore assente dalle liste)", warn: true };
}

function parseVisibility(template, p) {
  const neg = /^non compare se/i.test(p);
  if (/^compare\/si crea/i.test(p)) return { error: "condizione strutturale (voce Ente creata dal vincolo): non è una ConditionDTO" };
  const m = p.match(/^(?:non )?(?:compare|appare)(?: solo)? se\s+(.*)$/i);
  if (!m) return { error: "forma non riconosciuta" };
  let body = unquote(m[1]).replace(/\s+/g, " ").trim();
  let label = null, op = null, value = null;
  let f =
    body.match(/^(?:è )?compilat[oa] (?:il )?campo\s+(.+)$/i) ??
    body.match(/^viene inserito un valore nel campo\s+(.+)$/i) ??
    body.match(/^(.+?) è compilat[oa]$/i);
  if (f) { label = f[1].trim(); op = neg ? "EMPTY" : "FILLED"; }
  else if ((f = body.match(/^(?:selezionat[oa]\s+)?(.+?)\s*(>=|<=|=)\s*(.+)$/i))) {
    if (f[2] !== "=") return { error: `operatore ${f[2]} non previsto da ConditionDTO` };
    label = f[1].trim(); value = f[3].trim(); op = neg ? "NEQ" : "EQ";
  } else return { error: "forma non riconosciuta" };
  if (/condizione/i.test(label)) return { error: "riferimento a una condizione non esplicita" };

  const r = resolveLabel(template, label, op === "EQ" || op === "NEQ");
  if (r.ids.length === 0) return { error: `campo "${label}" non trovato nel template` };
  const warns = [];
  if (r.ids.length > 1) return { error: `campo "${label}" ambiguo: ${r.ids.join(", ")}` };
  if (r.how !== "esatta") warns.push(`etichetta "${label}" risolta in modo ${r.how}`);
  const cond = { flowId: r.ids[0], op };
  if (value != null) {
    const vc = valueCode(template, masterOf(template, r.ids[0]).label, value);
    cond.value = vc.code;
    if (vc.warn) warns.push(`valore "${value}": ${vc.how}`);
  }
  return { cond, label, warns };
}

const condRows = [];
const condByOcc = new Map(); // `${template}|${riga}` → ConditionDTO (per la propagazione dei ripetibili)
for (const o of occ.filter((o) => o.cond)) {
  const parts = splitParts(o.cond);
  const vis = parts.filter((p) => classify(p) === "VISIBILITA");
  const altre = parts.filter((p) => classify(p) !== "VISIBILITA").map((p) => `${classify(p)}: ${p}`);
  let esito, json = "", note = [];
  if (!vis.length) esito = "NESSUNA_VISIBILITA";
  else {
    const parsed = vis.map((p) => parseVisibility(o.template, p));
    const err = parsed.find((x) => x.error);
    if (err) { esito = "DA_TRADURRE"; note.push(err.error); }
    else {
      const conds = parsed.map((x) => x.cond);
      const c = conds.length === 1 ? conds[0] : { all: conds };
      json = JSON.stringify(c);
      condByOcc.set(`${o.template}|${o.riga}`, c);
      const w = parsed.flatMap((x) => x.warns);
      if (conds.some((c) => c.flowId === o.flowId)) w.push("la condizione cita il campo stesso");
      esito = w.length ? "RICONOSCIUTA_CON_RISERVA" : "RICONOSCIUTA";
      note.push(...w);
    }
  }
  condRows.push({
    template: o.template, riga: o.riga, flowId: o.flowId, gruppo: o.group, sezione: o.sezione, etichetta: o.label,
    testo_condizione: o.cond, parte_visibilita: vis.join(" | "), proposta_condition_json: json, esito,
    altre_annotazioni: altre.join(" | "), note_estrazione: note.join(" · "),
  });
}

/* ---------- 4. ripetibili e liste ---------- */

const REPEAT_SEEDS = [
  ["TENANT", (l) => /\btenant\b/.test(l)],
  ["INTEGRAZIONE", (l) => /^(richiesta|invio|note) integrazione$/.test(l)],
  ["ENTE", (l) => /\bnome ente\b/.test(l)],
  ["ODA", (l) => /^(oda|note oda|stato oda)$/.test(l)],
  ["ARPA", (l) => /\barpa\b/.test(l)],
  ["VINCOLI", (l) => /^(vincoli|stato vincolo)$/.test(l)],
];
function repeatFor(template, o) {
  const l = norm(o.label);
  for (const [key, test] of REPEAT_SEEDS) if (test(l)) return { key, motivo: "etichetta", incerto: false };
  if (/voce ente/i.test(o.cond)) return { key: "ENTE", motivo: "condizione: voce Ente creata dal vincolo", incerto: true };
  // Propagazione: condizionato da un campo seme di un gruppo ripetibile.
  const c = condByOcc.get(`${template}|${o.riga}`);
  const refs = c ? (c.all ?? [c]).map((x) => x.flowId) : [];
  for (const id of refs) {
    const m = masterOf(template, id);
    for (const [key, test] of REPEAT_SEEDS) if (test(norm(m.label))) return { key, motivo: `condizionato da "${m.label}" (${id})`, incerto: true };
  }
  return null;
}

const ISTAT = { regione: ["ISTAT_REGIONI", null], provincia: ["ISTAT_PROVINCE", "regione"], comune: ["ISTAT_COMUNI", "provincia"] };
const flowIdByLabel = (template, label) => resolveLabel(template, label, false).ids[0] ?? "";

function listFor(template, o, dt) {
  const l = norm(o.label);
  if (dt.type === "USER" || dt.type === "USERS") return { listId: "USERS", tipo: "USERS", motivo: `ruolo ${dt.userRole} (D-39)`, incerto: false };
  if (ISTAT[l]) {
    const [id, parent] = ISTAT[l];
    return { listId: id, tipo: "ISTAT", motivo: "cascata ISTAT", parentFlowId: parent ? flowIdByLabel(template, parent) : "", incerto: false };
  }
  const csv = findList(template, o.label);
  const selectish = ["SELECT", "MULTISELECT"].includes(dt.type);
  if (csv) {
    const tipo = { CONTROLLATO: "CONTROLLED", CONFIGURABILE: "CONFIGURABLE" }[csv.tipo] ?? csv.tipo;
    const warn = selectish ? "" : `lista trovata ma dtype "${o.dtype}": il tipo dovrebbe diventare SELECT`;
    const incompleta = ["MANCANTE", "INCOMPLETA"].includes(csv.tipo);
    return {
      listId: snake(csv.campo.split(" / ")[0]), tipo, motivo: `LISTE_VALORI_INIZIALI: "${csv.campo}" (${csv.valori.length} valori)`,
      incerto: !!warn || incompleta, nota: [warn, incompleta ? `lista ${csv.tipo} nel CSV` : ""].filter(Boolean).join(" · "),
    };
  }
  if (SI_NO_FIELDS.has(l) || /valori:\s*si,\s*no|\bsi,\s*no\b/i.test(o.cond))
    return { listId: "SI_NO", tipo: "CONTROLLED", motivo: "dominio SI/NO comune", incerto: !selectish, nota: selectish ? "" : `dtype "${o.dtype}" per un campo SI/NO` };
  if (!selectish) return null;
  if (/si popola volta per volta/i.test(o.dtype))
    return { listId: snake(o.label), tipo: "CONFIGURABLE", motivo: "menù 'si popola volta per volta' (D-40)", incerto: true, nota: "lista nuova senza valori iniziali" };
  return { listId: snake(o.label), tipo: "?", motivo: "menù senza lista corrispondente", incerto: true, nota: "nessuna lista in LISTE_VALORI_INIZIALI" };
}

const rlRows = [];
for (const [template, flows] of FLOWS) {
  for (const [flowId] of flows) {
    const o = masterOf(template, flowId);
    const dt = dataTypeFor(o);
    const rep = repeatFor(template, o);
    const li = listFor(template, o, dt);
    const ambiguo = roleOf.get(`${template}|${o.riga}`)?.ambiguo;
    const trasversale = /campo trasversal/i.test(o.nota)
      ? "occorrenza sorgente di un campo trasversale (D-37): in UI vale il trasversale, da escludere dalle occorrenze"
      : "";
    rlRows.push({
      template, flowId, riga_master: o.riga, gruppo: o.group, sezione: o.sezione, etichetta: o.label,
      dtype_md: o.dtype, datatype_proposto: dt.type, regola_datatype: dt.regola,
      repeat_group: rep?.key ?? "", motivo_repeat: rep?.motivo ?? "",
      list_id: li?.listId ?? "", tipo_lista: li?.tipo ?? "", parent_flow_id: li?.parentFlowId ?? "", motivo_lista: li?.motivo ?? "",
      incerto: rep?.incerto || li?.incerto || dt.warn || ambiguo || trasversale ? "SI" : "NO",
      note: [trasversale, dt.warn, li?.nota, ambiguo ? "master non determinato (vedi master_mirror.csv)" : ""].filter(Boolean).join(" · "),
    });
  }
}

/* ---------- condizioni che citano un altro gruppo ripetibile (semantica v0.1.5) ---------- */

const repeatOfFlow = new Map(rlRows.map((r) => [`${r.template}|${r.flowId}`, r.repeat_group]));
for (const r of condRows) {
  if (!r.proposta_condition_json) { r.riferimento_ripetibile = ""; continue; }
  const c = JSON.parse(r.proposta_condition_json);
  const own = repeatOfFlow.get(`${r.template}|${r.flowId}`) ?? "";
  const refs = (c.all ?? [c]).map((x) => x.flowId);
  const out = [];
  for (const id of refs) {
    const g = repeatOfFlow.get(`${r.template}|${id}`) ?? "";
    if (!g) continue;
    if (g === own) out.push(`${id} stesso gruppo ${g} → stessa riga`);
    else out.push(`${id} in ALTRO gruppo ${g}${own ? ` (occorrenza in ${own})` : " (occorrenza non ripetibile)"} → "almeno una riga"`);
  }
  r.riferimento_ripetibile = out.join(" · ");
}

/* ---------- scrittura ---------- */

const n1 = writeCsv("condizioni.csv",
  ["template", "riga", "flowId", "gruppo", "sezione", "etichetta", "testo_condizione", "parte_visibilita",
   "proposta_condition_json", "esito", "riferimento_ripetibile", "altre_annotazioni", "note_estrazione"], condRows);
const n2 = writeCsv("dtype.csv", ["forma_md", "conteggio", "datatype_proposto", "ripartizione", "regole_ed_esempi"],
  [...dtypeAgg.values()].sort((a, b) => b.conteggio - a.conteggio).map((a) => ({
    forma_md: a.forma, conteggio: a.conteggio, datatype_proposto: DTYPE_BASE[a.forma] ?? "?",
    ripartizione: [...a.per_tipo].map(([t, n]) => `${t}=${n}`).join(", "),
    regole_ed_esempi: [...a.esempi].map(([k, s]) => `${k} [${[...s].join("; ")}]`).join(" | "),
  })));
const n3 = writeCsv("master_mirror.csv",
  ["template", "flowId", "riga", "gruppo", "sezione", "etichetta", "ruolo_dedotto", "parola_chiave", "mirror_di",
   "popup_label", "popup_gruppo_sorgente", "ambiguo", "motivo", "nota_md"], mmRows);
const n4 = writeCsv("ripetibili_liste.csv",
  ["template", "flowId", "riga_master", "gruppo", "sezione", "etichetta", "dtype_md", "datatype_proposto", "regola_datatype",
   "repeat_group", "motivo_repeat", "list_id", "tipo_lista", "parent_flow_id", "motivo_lista", "incerto", "note"], rlRows);

const count = (rows, k) => rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {});
console.log(JSON.stringify({
  occorrenze: occ.length,
  condizioni: { righe: n1, esiti: count(condRows, "esito") },
  dtype: { forme: n2 },
  master_mirror: { righe: n3, ambiguo: count(mmRows, "ambiguo"), ruoli: count(mmRows, "ruolo_dedotto") },
  ripetibili_liste: { flowId: n4, incerto: count(rlRows, "incerto"), repeat: count(rlRows.filter((r) => r.repeat_group), "repeat_group"), tipi_lista: count(rlRows.filter((r) => r.list_id), "tipo_lista") },
}, null, 2));
