"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client";
import { authErrorMessage } from "@/components/auth/auth-errors";
import { useHydrated } from "@/components/auth/use-hydrated";
import { formValue } from "@/components/auth/form-value";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = formValue(e.currentTarget, "email");
    setEmail(value);
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: value }) });
      setSent(true);
    } catch (err) {
      toast.error(authErrorMessage("forgot", err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reimposta password"
      subtitle="Ti invieremo un link sicuro per impostare una nuova password."
      footer={<>Ti ricordi la password? <AuthLink href="/login">Torna al login</AuthLink></>}
    >
      {sent ? (
        <div className="flex items-start gap-3 border border-border bg-secondary p-4" data-testid="forgot-sent-message">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <p className="text-sm">
            Se esiste un account per <strong>{email}</strong>, il link di reset è stato inviato.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" data-testid="forgot-form">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              data-testid="forgot-email-input"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !hydrated} data-testid="forgot-submit-button">
            {loading && <Loader2 className="animate-spin" />} Invia link di reset
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
