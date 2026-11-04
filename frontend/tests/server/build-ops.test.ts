// @vitest-environment node
/**
 * K1 (D-156): worker e strumenti operativi compilati in JavaScript autonomo per l'immagine di esercizio. Ogni bundle
 * esegue SOLO il proprio programma (nessun "main" di un modulo incluso) e non richiede pacchetti esterni oltre alle
 * dipendenze facoltative del driver.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOps, ENTRIES } from "../../scripts/build-ops.mjs";

let outdir: string;
let metafile: { outputs: Record<string, { imports: Array<{ path: string; external?: boolean }> }> };

beforeAll(async () => {
  outdir = fs.mkdtempSync(path.join(os.tmpdir(), "practicehub-ops-"));
  metafile = (await buildOps({ outdir, log: () => {} })).metafile;
}, 120_000);
afterAll(() => {
  if (outdir) fs.rmSync(outdir, { recursive: true, force: true });
});

/** Esegue un bundle da una cartella senza node_modules, con un ambiente minimo (nessun database). */
const run = (name: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [path.join(outdir, `${name}.mjs`), ...args], {
    cwd: outdir,
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 60_000,
  });

describe("bundle operativi", () => {
  it("un file per programma, solo dipendenze facoltative del driver fuori dal bundle", () => {
    expect(Object.keys(ENTRIES).sort()).toEqual(["backup-db", "backup-service", "outbox-requeue", "reset-db", "seed-demo", "utenti-prova", "worker"]);
    for (const name of Object.keys(ENTRIES)) expect(fs.existsSync(path.join(outdir, `${name}.mjs`)), name).toBe(true);
    const external = new Set<string>();
    for (const out of Object.values(metafile.outputs)) for (const i of out.imports) if (i.external && !i.path.startsWith("node:")) external.add(i.path);
    const allowed = ["kerberos", "@mongodb-js/zstd", "snappy", "mongodb-client-encryption", "@aws-sdk/credential-providers", "gcp-metadata", "socks", "aws4"];
    const builtin = new Set(builtinModules);
    expect([...external].filter((m) => !allowed.includes(m) && !builtin.has(m))).toEqual([]);
  });

  it("ogni bundle esegue solo il proprio programma (il main di backup-db non parte dagli altri)", () => {
    const seed = run("seed-demo");
    expect(seed.stderr).toContain("SEED_DEMO=true");
    expect(seed.stdout + seed.stderr).not.toContain("backup-db.mjs backup|verify|restore");
    const requeue = run("outbox-requeue", ["--failed"]);
    expect(requeue.stdout + requeue.stderr).toMatch(/DB_NAME|MONGO_URL/);
    expect(requeue.stdout + requeue.stderr).not.toContain("backup-db.mjs backup|verify|restore");
    const backup = run("backup-db");
    expect(backup.stdout).toContain("Uso: backup-db.mjs backup|verify|restore");
  });
});
