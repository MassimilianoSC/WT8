"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch, browserNav } from "@/lib/client";
import { authErrorMessage } from "@/components/auth/auth-errors";
import { usePasswordChangeRequired } from "@/components/auth/password-change-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
  // D-173: the mandatory change ends by opening the app (a full load, so the layout reads the new MeDTO).
  const required = usePasswordChangeRequired();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Le nuove password non coincidono");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast.success("Password aggiornata");
      setCurrent("");
      setNext("");
      setConfirm("");
      if (required) browserNav.assign("/pratiche");
    } catch (err) {
      toast.error(authErrorMessage("change", err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="change-password-page">
      <PageHeader title="Cambia password" description="Aggiorna la password del tuo account." />
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-5" data-testid="change-password-form">
            <div className="space-y-2">
              <Label htmlFor="current">Password attuale</Label>
              <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="current-password-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">Nuova password</Label>
              <Input id="next" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-password-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Conferma nuova password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="confirm-password-input" />
            </div>
            <Button type="submit" disabled={loading} data-testid="change-password-submit-button">
              {loading && <Loader2 className="animate-spin" />} Aggiorna password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
