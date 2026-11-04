"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/assistente/assistant-chat";
import { useOptionalAssistant } from "@/components/assistente/assistant-store";

/**
 * "Chiedi" next to the bell, and the side panel it opens (project §9): a
 * column that reserves space on wide screens, a drawer over the page below
 * that, full screen on phones. It stays open across navigation.
 */

export const PAGE_PATH = "/assistente";
const ASK_ID = "assistant-ask";
const PANEL_ID = "assistant-panel";

function focusAsk() {
  document.getElementById(ASK_ID)?.focus();
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function AskButton() {
  const store = useOptionalAssistant();
  const pathname = usePathname();
  const onPage = pathname === PAGE_PATH;
  const open = !!store?.panelOpen && !onPage;
  const setOpen = store?.setPanelOpen;
  const refresh = store?.refreshStatus;

  const toggle = React.useCallback(() => {
    if (!setOpen) return;
    if (onPage) {
      document.getElementById("assistant-text")?.focus();
      return;
    }
    if (!open) refresh?.();
    setOpen(!open);
  }, [onPage, open, refresh, setOpen]);

  // Ctrl+K (⌘K) opens the panel, never while writing in a field.
  React.useEffect(() => {
    if (!setOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k" && !isTyping(e.target) && !open) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, toggle]);

  if (!store) return null;
  return (
    <Button
      id={ASK_ID}
      variant="ghost"
      className="h-10 gap-2 px-2 font-mono text-xs uppercase tracking-wider sm:px-3"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={open ? PANEL_ID : undefined}
      aria-label="Chiedi all'assistente"
      data-testid="assistant-ask"
    >
      <MessageSquare className="h-5 w-5" />
      <span className="hidden sm:inline">Chiedi</span>
    </Button>
  );
}

export function AssistantPanel() {
  const store = useOptionalAssistant();
  const pathname = usePathname();
  const router = useRouter();
  if (!store || !store.panelOpen || pathname === PAGE_PATH) return null;

  // Closing the panel stops the question in flight (contract §13.2).
  const close = () => {
    store.stop();
    store.setPanelOpen(false);
    focusAsk();
  };
  const maximize = () => {
    store.setPanelOpen(false);
    router.push(PAGE_PATH);
  };
  // On a phone the panel covers the page: it steps aside when a source opens.
  const onNavigate = () => {
    if (typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 1024px)").matches) store.setPanelOpen(false);
  };

  return (
    <aside
      id={PANEL_ID}
      className="fixed inset-0 z-50 h-[100dvh] border-border bg-background lg:inset-auto lg:bottom-0 lg:right-0 lg:top-16 lg:z-40 lg:h-auto lg:w-[420px] lg:max-w-[calc(100vw-2rem)] lg:border-l lg:shadow-2xl 2xl:sticky 2xl:bottom-auto 2xl:right-auto 2xl:top-16 2xl:h-[calc(100dvh-4rem)] 2xl:shrink-0 2xl:shadow-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
      data-testid="assistant-panel-shell"
    >
      <AssistantChat variant="panel" onClose={close} onMaximize={maximize} onNavigate={onNavigate} />
    </aside>
  );
}
