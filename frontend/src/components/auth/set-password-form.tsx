"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client";
import { useHydrated } from "@/components/auth/use-hydrated";
import { formValue } from "@/components/auth/form-value";
import { authErrorMessage, invalidLinkMessage } from "@/components/auth/auth-errors";

/** Shared form for both password reset and invitation set-password flows. */
export function SetPasswordForm({
  flow,
  token,
  endpoint,
  title,
  subtitle,
  cta,
}: {
  /** invite = /set-password (link of the invitation), reset = /reset-password. */
  flow: "invite" | "reset";
  token: string;
  endpoint: string;
  title: string;
  subtitle: string;
  cta: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  /** Italian message of the last failure (never the server's text); linkInvalid adds the way out. */
  const [error, setError] = React.useState<{ text: string; linkInvalid: boolean } | null>(null);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = formValue(e.currentTarget, "password");
    const confirm = formValue(e.currentTarget, "confirm");
    if (password !== confirm) {
      setError({ text: "Le password non coincidono.", linkInvalid: false });
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ token, password }) });
      toast.success("Password impostata. Ora puoi accedere.");
      router.push("/login");
    } catch (err) {
      const text = authErrorMessage(flow, err);
      setError({ text, linkInvalid: text === invalidLinkMessage(flow) });
    } finally {
      setLoading(false);
    }
  }

  const wayOut =
    flow === "reset" ? <AuthLink href="/forgot-password">Richiedi un nuovo link</AuthLink> : <AuthLink href="/login">Torna al login</AuthLink>;

  if (!token) {
    return (
      <AuthShell title={title} subtitle="Questo link non è completo.">
        <p className="text-sm" role="alert" data-testid="set-password-link-invalid">
          {invalidLinkMessage(flow)}
        </p>
        <div className="mt-4">{wayOut}</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={title} subtitle={subtitle} footer={<AuthLink href="/login">Torna al login</AuthLink>}>
      <form onSubmit={onSubmit} className="space-y-5" data-testid="set-password-form">
        <div className="space-y-2">
          <Label htmlFor="password">Nuova password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            data-testid="set-password-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Conferma password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            data-testid="set-password-confirm-input"
          />
        </div>
        {error && (
          <div className="space-y-2 border border-status-error px-3 py-2 text-sm" role="alert" data-testid="set-password-error">
            <p>{error.text}</p>
            {error.linkInvalid && wayOut}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading || !hydrated} data-testid="set-password-submit-button">
          {loading && <Loader2 className="animate-spin" />} {cta}
        </Button>
      </form>
    </AuthShell>
  );
}
