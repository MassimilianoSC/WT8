/**
 * Compilatore dei template (B2) — script fuori linea, da eseguire quando cambiano MD o dati curati:
 *   yarn templates:compile            (scrive src/data/templates/ solo se non ci sono ERRORI)
 *   yarn templates:compile --check    (non scrive: verifica che i JSON committati siano aggiornati)
 *
 * Gli output si committano: la build Docker non legge docs/baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { compileTemplates, stableStringify } from "../src/lib/templates/compiler";
import { loadCompilerInput, repoPaths } from "../src/lib/templates/load";
import { buildInitialLists } from "../src/lib/lists/catalog";

const frontendDir = path.resolve(__dirname, "..");
const paths = repoPaths(frontendDir);
const check = process.argv.includes("--check");

const input = loadCompilerInput(paths);
const result = compileTemplates(input);
const count = (s: string) => result.diagnostics.filter((d) => d.severity === s).length;
const errors = count("ERROR");
// Liste iniziali (B6): derivate dai template compilati e da LISTE_VALORI_INIZIALI.csv.
const catalog = buildInitialLists(
  Object.values(result.templates).map((t) => t!.template),
  input.lists,
  input.bindings
);

const files: Record<string, string> = {};
for (const [id, t] of Object.entries(result.templates)) files[`${id}.json`] = stableStringify(t) + "\n";
files["manifest.json"] = stableStringify(result.manifest) + "\n";
files["diagnostica.json"] = stableStringify(result.diagnostics) + "\n";
files["lists-initial.json"] = stableStringify(catalog) + "\n";

console.log(`Liste iniziali: ${catalog.lists.length} (avvisi ${catalog.warnings.length})`);
for (const w of catalog.warnings) console.log(`  lista: ${w}`);

console.log(`Template: ${Object.keys(result.templates).length} · errori ${errors} · avvisi ${count("WARNING")} · info ${count("INFO")}`);
for (const d of result.diagnostics.filter((x) => x.severity === "ERROR")) {
  console.error(`  ERRORE ${d.templateId ?? ""} ${d.row ? `#${d.row}` : ""} ${d.flowId ?? ""} [${d.code}] ${d.message}`);
}

if (check) {
  const stale = Object.entries(files).filter(([name, content]) => {
    const file = path.join(paths.outDir, name);
    return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content;
  });
  if (stale.length) {
    console.error(`JSON compilati non aggiornati: ${stale.map(([n]) => n).join(", ")} — eseguire yarn templates:compile`);
    process.exitCode = 1;
  } else console.log("JSON compilati aggiornati.");
} else if (errors > 0) {
  console.error("Compilazione con errori: nessun file scritto.");
  process.exitCode = 1;
} else {
  fs.mkdirSync(paths.outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(paths.outDir, name), content, "utf8");
  console.log(`Scritti ${Object.keys(files).length} file in ${path.relative(paths.root, paths.outDir)}`);
}
