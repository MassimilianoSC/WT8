"use client";
import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * A read that fails never leaves the page on "Caricamento…": it shows why, by
 * HTTP status (fixed Italian texts, never the server's), and a "Riprova".
 * A 401 has already sent to the login (apiFetch); the text stays in case it could not.
 */

export const SESSION_EXPIRED = "Sessione scaduta: accedi di nuovo.";

export function loadErrorMessage(e: unknown, notFound = "Dati non trovati: forse sono stati eliminati."): string {
  if (!(e instanceof ApiError)) return "WT8 non è raggiungibile: controlla la connessione e riprova.";
  if (e.status === 401) return SESSION_EXPIRED;
  if (e.status === 403) return "Non hai accesso a questi dati.";
  if (e.status === 404) return notFound;
  if (e.status === 0) return "Il server non risponde: riprova tra poco.";
  if (e.status >= 500) return "Errore del server: riprova tra poco.";
  return "Dati non disponibili in questo momento: riprova.";
}

export function LoadError({
  message,
  context,
  onRetry,
  className,
  testId = "load-error",
}: {
  message: string;
  /** What could not be read, before the reason (e.g. "Elenchi di Cliente Finale e Committente"). */
  context?: string;
  onRetry?: () => void;
  className?: string;
  testId?: string;
}) {
  const expired = message === SESSION_EXPIRED;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 p-4", className)} role="alert" data-testid={testId}>
      <AlertTriangle className="h-4 w-4 shrink-0 text-status-error" />
      <p className="flex-1 text-sm">{context ? `${context}: ${message}` : message}</p>
      {expired ? (
        <Button asChild size="sm" variant="outline">
          <a href="/login">Accedi</a>
        </Button>
      ) : (
        onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>
            <RotateCw className="h-4 w-4" /> Riprova
          </Button>
        )
      )}
    </div>
  );
}
