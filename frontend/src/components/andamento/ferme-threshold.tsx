"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import { loadAndamentoSettings, saveAndamentoSettings } from "@/components/andamento/andamento-source";
import type { AndamentoSettingsDTO } from "@/components/andamento/types";

/**
 * Threshold of the "pratiche ferme" of Andamento (§15.3), in Configurazione →
 * Soglie, ADMIN only; shown only with PH_ANDAMENTO on. Whole days 1–365, default 30.
 */
export function FermeThreshold() {
  const [settings, setSettings] = React.useState<AndamentoSettingsDTO | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setLoadError(null);
    loadAndamentoSettings()
      .then((s) => {
        setSettings(s);
        setText(String(s.sogliaFermeGiorni));
      })
      .catch((e) => setLoadError(loadErrorMessage(e)));
  }, []);
  React.useEffect(load, [load]);

  const days = Number(text);
  const valid = /^\d+$/.test(text.trim()) && days >= 1 && days <= 365;
  const dirty = !!settings && valid && days !== settings.sogliaFermeGiorni;

  async function save() {
    setSaving(true);
    try {
      const saved = await saveAndamentoSettings(days);
      setSettings(saved);
      setText(String(saved.sogliaFermeGiorni));
      toast.success("Soglia salvata");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-border bg-card" data-testid="ferme-threshold">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-xs uppercase tracking-wider">Andamento</h2>
      </header>
      {loadError ? (
        <LoadError message={loadError} onRetry={load} testId="ferme-threshold-error" />
      ) : !settings ? (
        <p className="p-4 font-mono text-xs text-muted-foreground">Caricamento…</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <div className="text-sm font-medium">Pratiche ferme: stesso stato da più di</div>
            <div className="text-xs text-muted-foreground">
              Vale per l&apos;elenco «Pratiche ferme» della pagina Andamento, per tutti i clienti.
              {settings.updatedAt && ` Ultima modifica ${format(new Date(settings.updatedAt), "dd/MM/yyyy HH:mm")}.`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="numeric"
              aria-label="Giorni per le pratiche ferme"
              aria-invalid={!valid || undefined}
              className="w-20 font-mono tabular"
              data-testid="ferme-threshold-input"
            />
            <span className="w-40 text-xs text-muted-foreground">giorni di calendario (1–365)</span>
            <Button size="sm" disabled={!dirty || saving} onClick={save} data-testid="ferme-threshold-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
