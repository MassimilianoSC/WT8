"use client";
import * as React from "react";
import { CheckCheck } from "lucide-react";
import type { NotificationKind, NotificationListResponse } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KIND_LABEL, NotificationList } from "@/components/notifiche/notification-list";
import { loadNotifications, markAllRead } from "@/components/notifiche/notifications-source";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

const ALL = "all";

/** All notifications (§8), with filters on unread and kind. */
export function NotificationsPage() {
  const [data, setData] = React.useState<NotificationListResponse | null>(null);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [kind, setKind] = React.useState<string>(ALL);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      setData(await loadNotifications({ unread: unreadOnly, limit: 50 }));
    } catch (e) {
      // A failed read shows why and "Riprova", never "Caricamento…" forever.
      setLoadError(loadErrorMessage(e));
    }
  }, [unreadOnly]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const items = (data?.items ?? []).filter((n) => kind === ALL || n.kind === kind);

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-6">
          <div className="w-48 space-y-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger data-testid="notifications-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutti i tipi</SelectItem>
                {(Object.keys(KIND_LABEL) as NotificationKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex h-10 items-center gap-3 text-sm">
            <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} data-testid="notifications-unread" />
            Solo non lette
          </label>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{data?.unread ?? 0} non lette</span>
          <Button
            variant="outline"
            disabled={!data?.unread}
            onClick={async () => {
              await markAllRead();
              await load();
            }}
            data-testid="notifications-read-all"
          >
            <CheckCheck className="h-4 w-4" /> Segna tutte lette
          </Button>
        </div>
      </div>
      <div className="border border-border bg-card">
        {loadError ? (
          <LoadError message={loadError} onRetry={() => void load()} testId="notifications-load-error" />
        ) : data === null ? (
          <p className="p-4 font-mono text-xs text-muted-foreground">Caricamento…</p>
        ) : (
          <NotificationList items={items} onRead={() => void load()} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">Leggere una notifica non chiude l&apos;alert: gli alert si chiudono compilando il campo o, dove previsto, a mano.</p>
    </div>
  );
}
