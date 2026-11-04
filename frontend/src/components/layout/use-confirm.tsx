"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Red confirm button (e.g. removing a row). */
  destructive?: boolean;
}

/**
 * The app's confirmation dialog instead of the browser's window.confirm:
 * `const [confirm, confirmDialog] = useConfirm()`, render `confirmDialog`, then
 * `if (await confirm({ title })) …`. Closing the dialog in any way answers false.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);

  const confirm = React.useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = React.useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <Dialog open={options !== null} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent data-testid="confirm-dialog">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)} data-testid="confirm-dialog-cancel">
            Annulla
          </Button>
          <Button
            variant={options?.destructive ? "destructive" : "default"}
            onClick={() => answer(true)}
            data-testid="confirm-dialog-ok"
            autoFocus
          >
            {options?.confirmLabel ?? "Conferma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
