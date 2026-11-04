"use client";
import * as React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBellV2 } from "@/components/notifiche/notification-bell-v2";
import { TemplateNav } from "@/components/layout/template-nav";
import { ConfigNav } from "@/components/layout/config-nav";
import { SUPPORT_EMAIL } from "@/components/layout/support";
import { AssistantProvider } from "@/components/assistente/assistant-store";
import { AskButton, AssistantPanel } from "@/components/assistente/assistant-panel";
import type { AssistantStatusDTO } from "@/components/assistente/types";
import type { MeDTO, TemplateId } from "@/lib/contract";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/** What the shell needs of the current user (from the session and the MeDTO). */
export interface ShellUser {
  name?: string | null;
  email?: string | null;
  /** Templates of the user's memberships; null = all (ADMIN). */
  templateIds: TemplateId[] | null;
  isAdmin: boolean;
  /** Team leader in at least one membership (Configurazione > Liste). */
  isLeader: boolean;
  /** Sees statistics or workload: PM, team leader or ADMIN (D-23). */
  canStats: boolean;
  /** Andamento (§15, switch on): ADMIN or Direzione. */
  canAndamento?: boolean;
  /** Direzione without memberships (§15.2, D-193): no list per client, starts on Andamento. */
  direzione?: boolean;
  /** Footer: "Amministratore" or the memberships (membershipSummary). */
  summary: string;
}

/** The assistant, when the MeDTO carries it (contract §13.1): missing = no "Chiedi". */
export interface ShellAssistant {
  me: MeDTO;
  status: AssistantStatusDTO;
}

export function AppShell({ user, assistant, children }: { user: ShellUser; assistant?: ShellAssistant; children: React.ReactNode }) {
  const shell = <Shell user={user}>{children}</Shell>;
  return assistant ? (
    <AssistantProvider me={assistant.me} initialStatus={assistant.status}>
      {shell}
    </AssistantProvider>
  ) : (
    shell
  );
}

function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const initials = (user.name || user.email || "U").slice(0, 2).toUpperCase();

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-6">
        <Link href={user.direzione ? "/andamento" : "/pratiche"} className="font-heading text-xl font-black tracking-tighter">
          PracticeHub
        </Link>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Workflow OS
        </div>
      </div>
      <nav className="flex-1 p-3" data-testid="sidebar-nav">
        {!user.direzione && (
          <React.Suspense fallback={null}>
            <TemplateNav allowed={user.templateIds} onNavigate={() => setOpen(false)} />
          </React.Suspense>
        )}
        <ConfigNav
          isAdmin={user.isAdmin}
          isLeader={user.isLeader}
          canStats={user.canStats}
          canAndamento={user.canAndamento}
          onNavigate={() => setOpen(false)}
        />
      </nav>
      <p className="border-t border-border px-3 py-2.5 text-xs text-muted-foreground" data-testid="support-contact">
        Hai un problema? Scrivi a{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">
          {SUPPORT_EMAIL}
        </a>
      </p>
      {user.summary && (
        <div className="border-t border-border p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" data-testid="sidebar-memberships">
          {user.summary}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">{SidebarContent}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card">{SidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen((v) => !v)}
              data-testid="mobile-menu-button"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <AskButton />
            <NotificationBellV2 />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-10 items-center gap-2 border border-border px-3 font-mono text-xs uppercase tracking-wider hover:bg-accent"
                  data-testid="user-menu-button"
                >
                  <span className="flex h-6 w-6 items-center justify-center bg-foreground text-[10px] text-background">
                    {initials}
                  </span>
                  <span className="hidden sm:inline">{user.name || user.email}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/change-password" data-testid="menu-change-password">
                    <KeyRound className="h-4 w-4" /> Cambia password
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} data-testid="menu-logout">
                  <LogOut className="h-4 w-4" /> Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
          <AssistantPanel />
        </div>
      </div>
    </div>
  );
}
