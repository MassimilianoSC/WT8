"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/components/auth/use-hydrated";
import { formValue } from "@/components/auth/form-value";
import { GENERIC_ERROR, loginErrorMessage } from "@/components/auth/auth-errors";
import { SESSION_EXPIRED_PARAM, safeNext } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const hydrated = useHydrated();
  // From apiFetch on a 401 (session expired): say why and go back to the page afterwards.
  const [expired, setExpired] = React.useState(false);
  const next = React.useRef("/pratiche");
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpired(params.get(SESSION_EXPIRED_PARAM) === "scaduta");
    next.current = safeNext(params.get("next"));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formValue(e.currentTarget, "email");
    const password = formValue(e.currentTarget, "password");
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      const message = loginErrorMessage(res?.error, res?.code);
      if (message) {
        toast.error(message);
      } else {
        toast.success("Bentornato");
        router.push(next.current);
        router.refresh();
      }
    } catch {
      toast.error(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Accedi"
      subtitle="Accedi alle pratiche del tuo team."
      footer={<>Password dimenticata? <AuthLink href="/forgot-password">Reimpostala</AuthLink></>}
    >
      {expired && (
        <p className="mb-5 border-l-4 border-foreground px-3 py-1 text-sm" role="status" data-testid="login-session-expired">
          Sessione scaduta: accedi di nuovo.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            data-testid="login-email-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="login-password-input"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !hydrated} data-testid="login-submit-button">
          {loading && <Loader2 className="animate-spin" />} Accedi
        </Button>
      </form>
    </AuthShell>
  );
}
