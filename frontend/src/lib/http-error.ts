/**
 * Errore applicativo con status HTTP: `handle()` (lib/api.ts) lo converte in `{ error, ...extra }`
 * (es. `code` e `currentRevision` nel 409, `rejected` nel 403, contratto §1). Nessuna dipendenza da auth.
 */
export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
