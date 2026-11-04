"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { AlertRuleConfigDTO, TemplateId, TemplateSummaryDTO } from "@/lib/contract";
import { ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listTemplates } from "@/components/pratiche/data-source";
import { loadAlertRules, saveAlertRule } from "@/components/configurazione/config-source";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

const UNIT_LABEL: Record<AlertRuleConfigDTO["unit"], string> = {
  WORKING_DAYS: "giorni lavorativi",
  CALENDAR_DAYS: "giorni di calendario",
};

/** Alert thresholds per client (D-46, v0.1.7): ADMIN only, days only. */
export function AlertRulesEditor() {
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [templateId, setTemplateId] = React.useState<TemplateId | null>(null);
  const [rules, setRules] = React.useState<AlertRuleConfigDTO[] | null>(null);
  /** Why the clients could not be read, or null. */
  const [templatesError, setTemplatesError] = React.useState<string | null>(null);
  const [templatesLoaded, setTemplatesLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const loadTemplates = React.useCallback(() => {
    setTemplatesError(null);
    setTemplatesLoaded(false);
    listTemplates()
      .then((t) => {
        setTemplates(t);
        setTemplateId((cur) => cur ?? t[0]?.id ?? null);
        setTemplatesLoaded(true);
      })
      .catch((e) => setTemplatesError(loadErrorMessage(e)));
  }, []);

  React.useEffect(loadTemplates, [loadTemplates]);

  const reload = React.useCallback(async () => {
    if (!templateId) return;
    setRules(await loadAlertRules(templateId));
    setLoadError(null);
  }, [templateId]);

  // A failed read shows why and "Riprova", never "Caricamento…" forever.
  const firstLoad = React.useCallback(() => {
    setRules(null);
    setLoadError(null);
    reload().catch((e) => setLoadError(loadErrorMessage(e)));
  }, [reload]);

  React.useEffect(firstLoad, [firstLoad]);

  return (
    <div className="space-y-6" data-testid="alert-rules-editor">
      <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-card p-4">
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Gestore</Label>
          <Select value={templateId ?? undefined} onValueChange={(v) => setTemplateId(v as TemplateId)}>
            <SelectTrigger data-testid="rules-template">
              <SelectValue placeholder="Seleziona…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Una soglia cambiata vale per gli alert non ancora emessi. Le soglie in giorni lavorativi considerano
          solo le festività nazionali.
        </p>
      </div>

      <div className="border border-border bg-card">
        {templatesError ? (
          <LoadError message={templatesError} onRetry={loadTemplates} testId="rules-load-error" />
        ) : templatesLoaded && templates.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground" data-testid="rules-no-template">
            Nessun gestore disponibile: non ci sono soglie da configurare.
          </p>
        ) : loadError ? (
          <LoadError message={loadError} onRetry={firstLoad} testId="rules-load-error" />
        ) : rules === null ? (
          <p className="p-4 font-mono text-xs text-muted-foreground">Caricamento…</p>
        ) : rules.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nessuna regola per questo gestore.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <RuleRow
                key={r.ruleId}
                rule={r}
                onSaved={(saved) => setRules((rs) => (rs ?? []).map((x) => (x.ruleId === saved.ruleId ? saved : x)))}
                onConflict={reload}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  onSaved,
  onConflict,
}: {
  rule: AlertRuleConfigDTO;
  onSaved: (r: AlertRuleConfigDTO) => void;
  onConflict: () => Promise<void>;
}) {
  const [text, setText] = React.useState(String(rule.days));
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setText(String(rule.days)), [rule.days]);

  const days = Number(text);
  const valid = /^\d+$/.test(text.trim()) && days <= 365;
  const dirty = valid && days !== rule.days;

  async function save() {
    setSaving(true);
    try {
      onSaved(await saveAlertRule(rule, days));
      toast.success("Soglia salvata");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.warning("Un altro utente ha modificato la soglia: valore ricaricato");
        await onConflict();
      } else toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]" data-testid={`rule-${rule.ruleId}`}>
      <div>
        <div className="text-sm font-medium">{rule.label}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{rule.ruleId}</div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="numeric"
          aria-label={`Giorni per ${rule.label}`}
          aria-invalid={!valid || undefined}
          className="w-20 font-mono tabular"
        />
        <span className="w-40 text-xs text-muted-foreground">{UNIT_LABEL[rule.unit]}</span>
        <Button size="sm" disabled={!dirty || saving} onClick={save} data-testid={`rule-save-${rule.ruleId}`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
        </Button>
      </div>
    </li>
  );
}
