/**
 * Importa il CSV ufficiale ISTAT "Elenco comuni italiani" in src/data/istat/istat.json (D-71) — da frontend/:
 *   yarn istat:import <percorso del CSV> [--versione AAAA-MM-GG]
 * Nessun download: il file va scaricato a mano dalla fonte ufficiale (vedi src/data/istat/README.md).
 */
import fs from "node:fs";
import path from "node:path";
import { parseIstatCsv } from "../src/lib/istat/parse";
import { parseArgs } from "./db/backup-db.mjs";

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file) {
  console.error("Uso: yarn istat:import <Elenco-comuni-italiani.csv> [--versione AAAA-MM-GG]");
  process.exit(1);
}
const version = typeof args.versione === "string" ? args.versione : new Date().toISOString().slice(0, 10);
const dataset = parseIstatCsv(new Uint8Array(fs.readFileSync(path.resolve(file))), version, "ISTAT — Elenco dei codici e delle denominazioni delle unità territoriali (CC BY 4.0)");
const out = path.resolve(__dirname, "../src/data/istat/istat.json");
fs.writeFileSync(out, JSON.stringify(dataset) + "\n", "utf8");
console.log(`ISTAT ${version}: ${dataset.regioni.length} regioni, ${dataset.province.length} province, ${dataset.comuni.length} comuni → ${path.relative(process.cwd(), out)}`);
