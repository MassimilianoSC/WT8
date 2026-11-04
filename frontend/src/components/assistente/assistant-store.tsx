"use client";
import * as React from "react";
import type { MeDTO } from "@/lib/contract";
import {
  askAssistant,
  loadAssistantStatus,
  newRequestId,
  type AskOutcome,
  type AssistantDoneEvent,
} from "@/components/assistente/assistant-source";
import { outcomeNotice, type Notice } from "@/components/assistente/assistant-errors";
import type {
  AssistantFactDTO,
  AssistantRequestContext,
  AssistantSourceDTO,
  AssistantStatusDTO,
} from "@/components/assistente/types";

/**
 * State of the assistant, shared by the "Chiedi" panel and the /assistente
 * page and kept across navigation (it lives in the AppShell). No history:
 * the conversation is only in memory, here and on the server (D-170).
 */

/** §13.2: the server keeps at most 8 questions per conversation. */
export const MAX_QUESTIONS = 8;
export const MAX_TEXT = 2000;

export type TurnPhase = "sending" | "reading" | "answering" | "done" | "error" | "interrupted" | "aborted";

export interface Turn {
  requestId: string;
  question: string;
  askedAt: string;
  /** Context label of THIS question, fixed at send time. */
  contextLabel: string | null;
  phase: TurnPhase;
  /** The server opened the answer ("start"): the question counts in the conversation. */
  started: boolean;
  statusText: string | null;
  statusPeriod?: { from: string; to: string };
  sources: Array<{ index: number; source: AssistantSourceDTO }>;
  facts: AssistantFactDTO[];
  text: string;
  done: AssistantDoneEvent | null;
  notice: Notice | null;
}

/** What the current page tells the assistant: the request context and a readable label. */
export interface PageContext {
  context: AssistantRequestContext;
  label: string;
}

interface AssistantStore {
  me: MeDTO;
  status: AssistantStatusDTO | null;
  turns: Turn[];
  conversationId: string | null;
  busy: boolean;
  draft: string;
  setDraft: (text: string) => void;
  /** Context of the NEXT question: the page's, unless the user removed it. */
  pageContext: PageContext | null;
  contextRemoved: boolean;
  removeContext: () => void;
  restoreContext: () => void;
  publishContext: (ctx: PageContext | null) => void;
  ask: (text: string) => void;
  stop: () => void;
  newConversation: (keepDraft?: string) => void;
  refreshStatus: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const Ctx = React.createContext<AssistantStore | null>(null);

export function useAssistant(): AssistantStore {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAssistant outside AssistantProvider");
  return v;
}

/** Null outside the provider or when the assistant is not available (no MeDTO.assistant). */
export function useOptionalAssistant(): AssistantStore | null {
  return React.useContext(Ctx);
}

/**
 * Pages publish their context with this hook; it follows the page for the
 * next question and never changes a question in flight. No-op without provider.
 */
export function useAssistantPageContext(ctx: PageContext | null): void {
  const store = React.useContext(Ctx);
  const publish = store?.publishContext;
  const key = ctx ? JSON.stringify(ctx) : "";
  React.useEffect(() => {
    if (!publish) return;
    publish(key ? (JSON.parse(key) as PageContext) : null);
    return () => publish(null);
  }, [publish, key]);
}

function blankTurn(requestId: string, question: string, contextLabel: string | null): Turn {
  return {
    requestId,
    question,
    askedAt: new Date().toISOString(),
    contextLabel,
    phase: "sending",
    started: false,
    statusText: null,
    sources: [],
    facts: [],
    text: "",
    done: null,
    notice: null,
  };
}

export function AssistantProvider({
  me,
  initialStatus,
  children,
}: {
  me: MeDTO;
  initialStatus: AssistantStatusDTO;
  children: React.ReactNode;
}) {
  const [status, setStatus] = React.useState<AssistantStatusDTO | null>(initialStatus);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pageContext, setPageContext] = React.useState<PageContext | null>(null);
  const [contextRemoved, setContextRemoved] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  // Synchronous guard: a double click must not send two questions (one per person, §13.2).
  const inFlight = React.useRef(false);
  const conversationRef = React.useRef<string | null>(null);
  const statusRef = React.useRef(status);
  statusRef.current = status;

  const patch = React.useCallback((requestId: string, fn: (t: Turn) => Turn) => {
    setTurns((all) => all.map((t) => (t.requestId === requestId ? fn(t) : t)));
  }, []);

  const refreshStatus = React.useCallback(() => {
    loadAssistantStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const publishContext = React.useCallback((ctx: PageContext | null) => {
    setPageContext(ctx);
    // A new page brings its context back.
    setContextRemoved(false);
  }, []);

  const ask = React.useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || text.length > MAX_TEXT || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      const requestId = newRequestId();
      const ctx = contextRemoved ? null : pageContext;
      setTurns((all) => [...all, blankTurn(requestId, text, ctx?.label ?? null)]);
      setDraft("");
      const controller = new AbortController();
      abortRef.current = controller;

      void askAssistant(
        {
          requestId,
          ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
          text,
          ...(ctx ? { context: ctx.context } : {}),
        },
        {
          signal: controller.signal,
          onEvent: (e) => {
            switch (e.type) {
              case "start":
                conversationRef.current = e.conversationId;
                setConversationId(e.conversationId);
                patch(requestId, (t) => ({ ...t, phase: "reading", started: true }));
                break;
              case "status":
                patch(requestId, (t) => ({
                  ...t,
                  phase: e.phase === "ANSWERING" ? "answering" : "reading",
                  statusText: e.text,
                  statusPeriod: e.period,
                }));
                break;
              case "source":
                patch(requestId, (t) => ({
                  ...t,
                  sources: [...t.sources.filter((s) => s.index !== e.index), { index: e.index, source: e.source }].sort((a, b) => a.index - b.index),
                }));
                break;
              case "facts":
                patch(requestId, (t) => ({ ...t, facts: [...t.facts, ...e.items] }));
                break;
              case "delta":
                patch(requestId, (t) => ({ ...t, phase: "answering", text: t.text + e.text }));
                break;
              case "heartbeat":
                break;
            }
          },
        }
      ).then((outcome: AskOutcome) => {
        if (outcome.kind === "done") {
          setStatus(outcome.event.usage);
          patch(requestId, (t) => ({ ...t, phase: "done", done: outcome.event, statusText: null }));
        } else {
          const phase: TurnPhase = outcome.kind === "error" ? "error" : outcome.kind;
          patch(requestId, (t) => ({ ...t, phase, statusText: null, notice: outcomeNotice(outcome, statusRef.current) }));
          if (outcome.kind === "error") {
            if (outcome.code === "NOT_ENABLED") setStatus((s) => (s ? { ...s, enabled: false, availability: "DISABLED" } : s));
            if (outcome.code === "CONVERSATION_EXPIRED" || outcome.code === "CONVERSATION_NOT_FOUND") {
              conversationRef.current = null;
              setConversationId(null);
              // The question goes back to the composer: never resent by itself.
              setDraft((d) => d || text);
            }
            if (outcome.code === "QUOTA_USER_DAY" || outcome.code === "QUOTA_USER_MINUTE") refreshStatus();
          }
        }
        if (abortRef.current === controller) abortRef.current = null;
        inFlight.current = false;
        setBusy(false);
      });
    },
    [contextRemoved, pageContext, patch, refreshStatus]
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = React.useCallback(
    (keepDraft?: string) => {
      abortRef.current?.abort();
      conversationRef.current = null;
      setConversationId(null);
      setTurns([]);
      if (keepDraft !== undefined) setDraft(keepDraft);
    },
    []
  );

  // Leaving the app (logout, reload) stops the question in flight.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const value = React.useMemo<AssistantStore>(
    () => ({
      me,
      status,
      turns,
      conversationId,
      busy,
      draft,
      setDraft,
      pageContext,
      contextRemoved,
      removeContext: () => setContextRemoved(true),
      restoreContext: () => setContextRemoved(false),
      publishContext,
      ask,
      stop,
      newConversation,
      refreshStatus,
      panelOpen,
      setPanelOpen,
    }),
    [me, status, turns, conversationId, busy, draft, pageContext, contextRemoved, publishContext, ask, stop, newConversation, refreshStatus, panelOpen]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Can a question be sent now: assistant on and ready, conversation not full. */
export function sendBlock(status: AssistantStatusDTO | null, turns: Turn[]): "disabled" | "unavailable" | "full" | null {
  if (!status || !status.enabled || status.availability === "DISABLED") return "disabled";
  if (status.availability === "UNAVAILABLE") return "unavailable";
  if (turns.filter((t) => t.started).length >= MAX_QUESTIONS) return "full";
  return null;
}
