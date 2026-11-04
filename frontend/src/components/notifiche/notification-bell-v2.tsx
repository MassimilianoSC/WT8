"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationListResponse } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationList } from "@/components/notifiche/notification-list";
import { loadNotifications, markAllRead } from "@/components/notifiche/notifications-source";

const POLL_MS = 30_000;

/**
 * Notification bell (§8).
 */
export function NotificationBellV2() {
  const [data, setData] = React.useState<NotificationListResponse | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setData(await loadNotifications({ limit: 50 }));
    } catch {
      /* the bell is not critical */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifiche, ${unread} non lette`} data-testid="bell-v2">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center bg-status-error px-1 font-mono text-[10px] text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs uppercase tracking-wider">Notifiche</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 font-mono text-[10px] uppercase tracking-wider"
            disabled={unread === 0}
            onClick={async () => {
              await markAllRead().catch(() => {});
              await load();
            }}
            data-testid="bell-read-all"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Segna tutte lette
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <NotificationList items={data?.items ?? []} onRead={() => void load()} onNavigate={() => setOpen(false)} compact />
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span>Leggere una notifica non chiude l&apos;alert.</span>
          <Link href="/notifiche" className="font-mono uppercase tracking-wider hover:text-foreground" onClick={() => setOpen(false)}>
            Tutte
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
