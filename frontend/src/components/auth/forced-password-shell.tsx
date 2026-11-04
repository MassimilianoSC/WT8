"use client";
import * as React from "react";
import { signOut } from "next-auth/react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordChangeRequiredProvider } from "@/components/auth/password-change-context";

export const FORCED_CHANGE_TEXT = "Per sicurezza devi cambiare la password prima di continuare: le altre pagine restano bloccate finché non la cambi.";

/**
 * Bare shell of the mandatory password change (D-173): no menus, no bell,
 * nothing that calls other /api routes (they answer 403 CAMBIO_PASSWORD).
 * Only the warning, the page and "Esci".
 */
export function ForcedPasswordShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background" data-testid="forced-password-shell">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 lg:px-8">
        <span className="font-heading text-xl font-black tracking-tighter">PracticeHub</span>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{email}</span>
          <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })} data-testid="forced-logout">
            <LogOut className="h-4 w-4" /> Esci
          </Button>
        </div>
      </header>
      <main className="space-y-6 p-4 lg:p-8">
        <div className="flex max-w-2xl gap-3 border-2 border-status-progress bg-card px-4 py-3 text-sm" role="alert" data-testid="forced-password-warning">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{FORCED_CHANGE_TEXT}</p>
        </div>
        <PasswordChangeRequiredProvider>{children}</PasswordChangeRequiredProvider>
      </main>
    </div>
  );
}
