/**
 * Confronto tra i template compilati committati in un riferimento git (default HEAD) e quelli attuali in
 * src/data/templates/ (o in una cartella indicata). Serve quando cambia la baseline: deve cambiare solo
 * ciò che si vuole, non la struttura delle occorrenze.
 *   yarn templates:diff                 (HEAD contro la cartella di lavoro)
 *   yarn templates:diff --ref <commit>
 *   yarn templates:diff --json          (uscita JSON)
 *
 * Confronta per occurrenceKey (flowId@sezione): presenza, kind, gruppo owner, tipo, lista, required, gruppo
 * ripetibile, condizione, calcolato, pop-up; l'ordine relativo delle occorrenze nella sezione; etichette a
 * parte (solo informative). Poi sezioni, gruppi ripetibili, vincoli, trasversali e collegamenti dei motori.
 * L'ordine assoluto (numero di riga) e la versione non contano.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TEMPLATE_IDS, type FieldOccurrenceDTO, type TemplateDTO } from "../src/lib/contract";
import { stableStringify, type CompiledTemplate } from "../src/lib/templates/compiler";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ref = arg("--ref") ?? "HEAD";
const frontendDir = path.resolve(__dirname, "..");
const outDir = arg("--dir") ? path.resolve(arg("--dir")!) : path.join(frontendDir, "src", "data", "templates");

function readRef(id: string): CompiledTemplate {
  const text = execFileSync("git", ["show", `${ref}:frontend/src/data/templates/${id}.json`], { cwd: frontendDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(text);
}
const readNow = (id: string): CompiledTemplate => JSON.parse(fs.readFileSync(path.join(outDir, `${id}.json`), "utf8"));

const STRUCT_KEYS: (keyof FieldOccurrenceDTO)[] = ["kind", "ownerGroup", "dataType", "list", "required", "repeatGroup", "condition", "computed", "popup"];
const s = (v: unknown) => (v === undefined ? "∅" : stableStringify(v, 0));

export interface Diff {
  templateId: string;
  kind: "OCCURRENCE_ADDED" | "OCCURRENCE_REMOVED" | "OCCURRENCE_CHANGED" | "ORDER_CHANGED" | "LABEL_CHANGED" | "STRUCTURE_CHANGED" | "BINDINGS_CHANGED";
  key: string;
  detail: string;
}

export function diffTemplate(id: string, a: CompiledTemplate, b: CompiledTemplate): Diff[] {
  const out: Diff[] = [];
  const push = (kind: Diff["kind"], key: string, detail: string) => out.push({ templateId: id, kind, key, detail });
  const byKey = (t: TemplateDTO) => new Map(t.occurrences.map((o) => [o.occurrenceKey, o]));
  const A = byKey(a.template);
  const B = byKey(b.template);
  for (const [k, o] of A) if (!B.has(k)) push("OCCURRENCE_REMOVED", k, `${o.label} (${o.kind})`);
  for (const [k, o] of B) if (!A.has(k)) push("OCCURRENCE_ADDED", k, `${o.label} (${o.kind})`);
  for (const [k, oa] of A) {
    const ob = B.get(k);
    if (!ob) continue;
    for (const f of STRUCT_KEYS) if (s(oa[f]) !== s(ob[f])) push("OCCURRENCE_CHANGED", k, `${String(f)}: ${s(oa[f])} → ${s(ob[f])}`);
    if (oa.label !== ob.label) push("LABEL_CHANGED", k, `"${oa.label}" → "${ob.label}"`);
  }
  // Ordine relativo delle occorrenze comuni in ogni sezione.
  for (const sec of new Set([...a.template.occurrences, ...b.template.occurrences].map((o) => o.sectionKey))) {
    const seq = (t: TemplateDTO) =>
      t.occurrences
        .filter((o) => o.sectionKey === sec && A.has(o.occurrenceKey) && B.has(o.occurrenceKey))
        .sort((x, y) => x.order - y.order)
        .map((o) => o.occurrenceKey);
    if (seq(a.template).join() !== seq(b.template).join()) push("ORDER_CHANGED", sec, "ordine relativo delle occorrenze diverso");
  }
  for (const f of ["sections", "repeatGroups", "constraints", "transversal"] as const) {
    if (s(a.template[f]) !== s(b.template[f])) push("STRUCTURE_CHANGED", f, `${s(a.template[f]).length} → ${s(b.template[f]).length} caratteri`);
  }
  const bindingsNoRow = (c: CompiledTemplate) => ({
    computed: c.bindings.computed,
    excluded: c.bindings.excluded.map(({ row: _r, ...x }) => x),
    effects: c.bindings.effects.map(({ row: _r, ...x }) => x),
  });
  for (const f of ["computed", "excluded", "effects"] as const) {
    const x = s(bindingsNoRow(a)[f]);
    const y = s(bindingsNoRow(b)[f]);
    if (x !== y) push("BINDINGS_CHANGED", f, `${x} → ${y}`);
  }
  return out;
}

function main() {
  const all: Diff[] = [];
  for (const id of TEMPLATE_IDS) all.push(...diffTemplate(id, readRef(id), readNow(id)));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(all, null, 2));
    return;
  }
  console.log(`Confronto ${ref} → ${path.relative(path.resolve(frontendDir, ".."), outDir)}: ${all.length} differenze`);
  for (const d of all) console.log(`  ${d.templateId} ${d.kind} ${d.key}: ${d.detail}`);
}

if (require.main === module) main();
