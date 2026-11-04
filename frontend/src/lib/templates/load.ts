/**
 * Lettura degli ingressi del compilatore dai file del repository (script fuori linea e prove).
 * Mai usato durante le richieste: l'app legge solo i JSON compilati in src/data/templates/.
 */
import fs from "node:fs";
import path from "node:path";
import type { BindingsData, CompilerInput, ConditionsData, InitialListRow, OverridesData } from "@/lib/templates/compiler";

export const BASELINE = "2026-10-08";

export interface RepoPaths {
  root: string;
  baselineDir: string;
  listsCsv: string;
  dataDir: string;
  outDir: string;
}

export function repoPaths(frontendDir: string): RepoPaths {
  const root = path.resolve(frontendDir, "..");
  return {
    root,
    baselineDir: path.join(root, "docs", "baseline", BASELINE),
    listsCsv: path.join(root, "docs", "baseline", "derivati", "LISTE_VALORI_INIZIALI.csv"),
    dataDir: path.join(frontendDir, "src", "data"),
    outDir: path.join(frontendDir, "src", "data", "templates"),
  };
}

/** CSV con separatore ";" e virgolette doppie (LISTE_VALORI_INIZIALI). */
export function parseSemicolonCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

export function readInitialLists(file: string): InitialListRow[] {
  const [header, ...rows] = parseSemicolonCsv(fs.readFileSync(file, "utf8"));
  const keys = header.map((h) => h.trim());
  return rows
    .filter((r) => r.length >= keys.length - 1 && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])) as unknown as InitialListRow);
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

export function loadCompilerInput(paths: RepoPaths): CompilerInput {
  const bindings = readJson<BindingsData>(path.join(paths.dataDir, "template-bindings.json"));
  const markdown: Record<string, string> = {};
  for (const t of Object.values(bindings.templates)) {
    markdown[t.file] = fs.readFileSync(path.join(paths.baselineDir, t.file), "utf8");
  }
  return {
    baseline: BASELINE,
    markdown,
    bindings,
    conditions: readJson<ConditionsData>(path.join(paths.dataDir, "template-conditions.json")),
    overrides: readJson<OverridesData>(path.join(paths.dataDir, "template-overrides.json")),
    lists: readInitialLists(paths.listsCsv),
  };
}
