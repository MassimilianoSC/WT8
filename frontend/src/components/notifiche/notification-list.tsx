"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, AtSign, CalendarClock, Info, Send } from "lucide-react";
import type { NotificationDTO, NotificationKind } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { linkHref, markRead } from "@/components/notifiche/notifications-source";

export const KIND_LABEL: Record<NotificationKind, string> = {
  ASSIGN: "Assegna",
  ALERT: "Alert",
  REMINDER: "Promemoria",
  MENTION: "Menzione",
  SYSTEM: "Sistema",
};

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  ASSIGN: Send,
  ALERT: AlertTriangle,
  REMINDER: CalendarClock,
  MENTION: AtSign,
  SYSTEM: Info,
};

/**
 * Notifications, newest first. A click marks the item read and opens the
 * linked point of the practice. Reading never closes an alert (§8).
 * Without a link (SYSTEM notices, e.g. mail not sent): the click only marks
 * it read, the text is shown in full, and once read it is no longer a button.
 */
export function NotificationList({
  items,
  onRead,
  onNavigate,
  compact = false,
}: {
  items: NotificationDTO[];
  /** Called after an item has been marked read. */
  onRead?: (id: string) => void;
  /** Called before opening a linked practice (the bell closes its popover). */
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();

  async function open(n: NotificationDTO) {
    if (!n.read) {
      await markRead(n.id).catch(() => {});
      onRead?.(n.id);
    }
    if (n.link) {
      onNavigate?.();
      router.push(linkHref(n.link));
    }
  }

  if (items.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Nessuna notifica.</p>;
  }

  return (
    <ul className="divide-y divide-border" data-testid="notification-list">
      {items.map((n) => {
        const Icon = KIND_ICON[n.kind] ?? Info;
        const inert = !n.link && n.read;
        const Row = inert ? "div" : "button";
        return (
          <li key={n.id}>
            <Row
              {...(inert ? {} : { type: "button" as const, onClick: () => void open(n) })}
              {...(!n.link && !n.read ? { title: "Segna come letta" } : {})}
              data-testid={`notification-${n.id}`}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                !inert && "hover:bg-accent",
                !n.read && "bg-secondary"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", n.kind === "ALERT" ? "text-status-error" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", !n.read && "font-semibold")}>{n.title}</span>
                  {!n.read && <span className="h-2 w-2 shrink-0 bg-primary" aria-label="Non letta" />}
                </span>
                <span className={cn("block text-xs text-muted-foreground", compact && n.link && "line-clamp-2")}>{n.body}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {KIND_LABEL[n.kind]} · {format(new Date(n.createdAt), "dd/MM/yyyy HH:mm")}
                </span>
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
