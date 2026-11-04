"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { newOperationId } from "@/components/scheda/commands";

/**
 * Shared frame of the command dialogs. The operationId is created when the
 * dialog opens and reused if the user retries after an error, so a request
 * that reached the server is not executed twice (v0.1.7).
 */
export function CommandDialogShell({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitVariant = "default",
  canSubmit = true,
  onSubmit,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  submitVariant?: "default" | "destructive";
  canSubmit?: boolean;
  /** Runs the command; resolve = done (the dialog closes), reject = show the error. */
  onSubmit: (operationId: string) => Promise<void>;
  children?: React.ReactNode;
  testId: string;
}) {
  const [operationId, setOperationId] = React.useState(newOperationId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setOperationId(newOperationId());
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(operationId);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent data-testid={testId}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
          </DialogHeader>
          {children}
          {error && (
            <p className="border border-status-error px-3 py-2 text-sm text-status-error" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" variant={submitVariant} disabled={busy || !canSubmit} data-testid={`${testId}-submit`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {error ? "Riprova" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
