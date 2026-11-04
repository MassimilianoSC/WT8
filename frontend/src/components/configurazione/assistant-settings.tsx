"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { loadAssistantSettings, saveAssistantSettings } from "@/components/assistente/assistant-source";
import { romeDay, romeTime } from "@/components/assistente/assistant-errors";
import type { AssistantSettingsDTO, AssistantSettingsUpdateRequest } from "@/components/assistente/types";

/** Allowed ranges (D-171, contract §13.1). */
export const DAILY_RANGE = { min: 1, max: 100 } as const;
export const MINUTE_RANGE = { min: 1, max: 10 } as const;

function settingsError(e: unknown): string {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 422) return "Valori non ammessi: domande al giorno da 1 a 100, al minuto da 1 a 10.";
  if (status === 403) return "Solo gli amministratori possono cambiare l'assistente.";
  if (status === 401) return "Sessione scaduta: accedi di nuovo.";
  return "Non è stato possibile salvare. Riprova tra poco.";
}

function parseLimit(text: string, range: { min: number; max: number }): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= range.min && n <= range.max ? n : null;
}

/**
 * Configurazione > Assistente AI (D-169, D-171): ADMIN only. The switch turns
 * the assistant on or off for everyone at once; the two limits are the same
 * for every person. Saved in the database, effective immediately, audited.
 */
export function AssistantSettingsEditor() {
  const [settings, setSettings] = React.useState<AssistantSettingsDTO | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [daily, setDaily] = React.useState("");
  const [minute, setMinute] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const apply = React.useCallback((s: AssistantSettingsDTO) => {
    setSettings(s);
    setDaily(String(s.dailyLimit));
    setMinute(String(s.perMinuteLimit));
  }, []);

  React.useEffect(() => {
    loadAssistantSettings()
      .then(apply)
      .catch((e) => setLoadError(e instanceof ApiError && e.status === 403 ? settingsError(e) : "Impostazioni dell'assistente non disponibili."));
  }, [apply]);

  const save = async (body: AssistantSettingsUpdateRequest, done: string) => {
    setSaving(true);
    try {
      apply(await saveAssistantSettings(body));
      toast.success(done);
    } catch (e) {
      toast.error(settingsError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <p className="border border-status-error px-3 py-2 text-sm" role="alert" data-testid="assistant-settings-error">
        {loadError}
      </p>
    );
  }
  if (!settings) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Caricamento" />;
  }

  const dailyValue = parseLimit(daily, DAILY_RANGE);
  const minuteValue = parseLimit(minute, MINUTE_RANGE);
  const changes: AssistantSettingsUpdateRequest = {};
  if (dailyValue !== null && dailyValue !== settings.dailyLimit) changes.dailyLimit = dailyValue;
  if (minuteValue !== null && minuteValue !== settings.perMinuteLimit) changes.perMinuteLimit = minuteValue;
  const valid = dailyValue !== null && minuteValue !== null;
  const dirty = Object.keys(changes).length > 0;

  return (
    <div className="max-w-2xl space-y-6" data-testid="assistant-settings">
      <section className="space-y-3 border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="assistant-enabled" className="text-sm font-medium">
              Assistente attivo per tutti
            </Label>
            <p className="text-xs text-muted-foreground">
              Spento, il pulsante &quot;Chiedi&quot; mostra &quot;Assistente disattivato dall&apos;amministratore&quot;. Vale subito, senza riavvio.
            </p>
          </div>
          <Switch
            id="assistant-enabled"
            checked={settings.enabled}
            disabled={saving}
            onCheckedChange={(on) => void save({ enabled: on }, on ? "Assistente acceso per tutti." : "Assistente spento per tutti.")}
            data-testid="assistant-enabled"
          />
        </div>
        {!settings.technicalEnabled && (
          <p className="border-l-4 border-status-progress px-3 py-2 text-xs" data-testid="assistant-technical-off">
            L&apos;assistente è spento nella configurazione del server: finché resta così, questo interruttore non ha effetto.
          </p>
        )}
      </section>

      <form
        className="space-y-4 border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && dirty) void save(changes, "Limiti salvati.");
        }}
        data-testid="assistant-limits"
      >
        <p className="text-sm font-medium">Limiti per persona</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LimitField id="assistant-daily" label="Domande al giorno" range={DAILY_RANGE} value={daily} onChange={setDaily} ok={dailyValue !== null} hint="Il conteggio riparte a mezzanotte (ora di Roma)." />
          <LimitField id="assistant-minute" label="Domande al minuto" range={MINUTE_RANGE} value={minute} onChange={setMinute} ok={minuteValue !== null} hint="Evita raffiche di domande." />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" data-testid="assistant-updated">
            {settings.updatedAt
              ? `Ultima modifica: ${romeDay(settings.updatedAt)} alle ${romeTime(settings.updatedAt)}${settings.updatedBy ? `, ${settings.updatedBy}` : ""}.`
              : "Valori iniziali: 30 al giorno, 4 al minuto."}
          </p>
          <Button type="submit" disabled={!valid || !dirty || saving} data-testid="assistant-limits-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
          </Button>
        </div>
      </form>
    </div>
  );
}

function LimitField({
  id,
  label,
  range,
  value,
  onChange,
  ok,
  hint,
}: {
  id: string;
  label: string;
  range: { min: number; max: number };
  value: string;
  onChange: (v: string) => void;
  ok: boolean;
  hint: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 font-mono"
        aria-invalid={!ok || undefined}
        aria-describedby={!ok ? errorId : undefined}
        data-testid={id}
      />
      {ok ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : (
        <p id={errorId} className="text-xs text-status-error">
          Da {range.min} a {range.max}.
        </p>
      )}
    </div>
  );
}
