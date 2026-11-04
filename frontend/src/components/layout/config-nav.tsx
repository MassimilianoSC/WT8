"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sidebar block of the new pages: notifications (F5) for everyone; lists for
 * team leaders and ADMIN, alert thresholds and users for ADMIN only (F4).
 */
export function ConfigNav({
  isAdmin,
  isLeader,
  canStats,
  canAndamento = false,
  onNavigate,
}: {
  isAdmin: boolean;
  isLeader: boolean;
  /** PM of a template, team leader or ADMIN (D-23). */
  canStats: boolean;
  /** Andamento (§15, switch on): ADMIN or Direzione. */
  canAndamento?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const entries = [
    // Only with the switch on (§15): off, the menu is exactly as before.
    { href: "/andamento", label: "Andamento", show: canAndamento },
    { href: "/notifiche", label: "Notifiche", show: true },
    { href: "/statistiche", label: "Statistiche", show: canStats },
    { href: "/configurazione/liste", label: "Liste", show: isAdmin || isLeader },
    { href: "/configurazione/soglie", label: "Soglie alert", show: isAdmin },
    { href: "/configurazione/utenti", label: "Utenti", show: isAdmin },
    { href: "/configurazione/import", label: "Import", show: isAdmin },
    { href: "/configurazione/assistente", label: "Assistente AI", show: isAdmin },
  ].filter((e) => e.show);
  if (entries.length === 0) return null;

  return (
    <div className="mb-3" data-testid="config-nav">
      <div className="flex items-center gap-3 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <Settings2 className="h-4 w-4" />
        Notifiche e configurazione
      </div>
      {entries.map((e) => {
        const active = pathname === e.href;
        return (
          <Link
            key={e.href}
            href={e.href}
            onClick={onNavigate}
            data-testid={`nav-config-${e.href.split("/").pop()}`}
            className={cn(
              "mb-0.5 flex items-center border border-transparent py-2 pl-10 pr-3 font-mono text-xs uppercase tracking-wider transition-colors",
              active ? "border-border bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {e.label}
          </Link>
        );
      })}
    </div>
  );
}
