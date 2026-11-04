"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDown, Maximize2, Plus, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_QUESTIONS,
  MAX_TEXT,
  sendBlock,
  useAssistant,
  type Turn,
} from "@/components/assistente/assistant-store";
import {
  APP_WORKS,
  DISABLED_TEXT,
  DISCLAIMER,
  UNAVAILABLE_TEXT,
  answerStateNotice,
  periodText,
  readAtText,
  romeTime,
  usageText,
  type Notice,
} from "@/components/assistente/assistant-errors";
import { sourceDetail, sourceHref } from "@/components/assistente/source-links";
import { answerBlocks, type Run } from "@/components/assistente/answer-text";
import { suggestionsFor } from "@/components/assistente/suggestions";
import type { AssistantFactDTO, AssistantSourceDTO } from "@/components/assistente/types";

/**
 * The assistant's conversation, the same component in the "Chiedi" panel and
 * on /assistente (project §9). Swiss style: stacked blocks, 1 px borders,
 * radius 0, no bubbles or avatars; colour only for errors and quota.
 */

const LABEL = "font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground";
/** Distance from the bottom under which new text keeps the view at the bottom. */
const NEAR_BOTTOM_PX = 48;

export function AssistantChat({
  variant,
  onClose,
  onMaximize,
  onNavigate,
}: {
  variant: "panel" | "page";
  onClose?: () => void;
  onMaximize?: () => void;
  /** A source link was followed (the mobile panel closes itself). */
  onNavigate?: () => void;
}) {
  const store = useAssistant();
  const { status, turns, busy } = store;
  const block = sendBlock(status, turns);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = React.useState(true);

  React.useEffect(() => {
    composerRef.current?.focus();
  }, []);

  // Follow the answer only while the user is at the bottom.
  const last = turns[turns.length - 1];
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottom) el.scrollTop = el.scrollHeight;
  }, [last?.text, last?.phase, last?.sources.length, turns.length, nearBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
  };
  const toBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNearBottom(true);
  };

  const announcement = announcementFor(last);
  const context = store.contextRemoved ? null : store.pageContext;
  const suggestions = React.useMemo(() => suggestionsFor(store.me, store.pageContext?.context ?? null), [store.me, store.pageContext]);

  const fill = (text: string) => {
    store.setDraft(text);
    composerRef.current?.focus();
  };

  return (
    <section
      className={cn("flex min-h-0 flex-col bg-background", variant === "panel" ? "h-full" : "h-[calc(100dvh-10rem)] min-h-[420px] border border-border")}
      aria-label="Assistente"
      data-testid={`assistant-${variant}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Assistente · sola lettura</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Nuova conversazione" onClick={() => store.newConversation()} disabled={turns.length === 0 && !busy} testId="assistant-new">
            <Plus className="h-4 w-4" />
          </IconButton>
          {onMaximize && (
            <IconButton label="Apri a tutta pagina" onClick={onMaximize} testId="assistant-maximize">
              <Maximize2 className="h-4 w-4" />
            </IconButton>
          )}
          {onClose && (
            <IconButton label="Chiudi l'assistente" onClick={onClose} testId="assistant-close">
              <X className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4" data-testid="assistant-messages">
          {turns.length === 0 && block === null && (
            <div className="space-y-3" data-testid="assistant-suggestions">
              <p className={LABEL}>Domande suggerite</p>
              <ul className="space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => fill(s)}
                      className="w-full border border-border px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="space-y-5">
            {turns.map((t) => (
              <TurnBlock key={t.requestId} turn={t} onNavigate={onNavigate} onFill={fill} />
            ))}
          </ol>
        </div>
        {!nearBottom && (
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background"
            onClick={toBottom}
            data-testid="assistant-to-bottom"
          >
            <ArrowDown className="h-4 w-4" /> Vai in fondo
          </Button>
        )}
      </div>
      <div className="sr-only" aria-live="polite" data-testid="assistant-live">
        {announcement}
      </div>

      <footer className="border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {block === "disabled" && <NoticeBox notice={{ tone: "neutral", title: DISABLED_TEXT, action: "none" }} testId="assistant-disabled" />}
        {block === "unavailable" && (
          <NoticeBox notice={{ tone: "error", title: UNAVAILABLE_TEXT, detail: APP_WORKS, action: "none" }} testId="assistant-unavailable" />
        )}
        {block === "full" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2 text-sm" data-testid="assistant-full">
            <span>Questa conversazione ha raggiunto {MAX_QUESTIONS} domande.</span>
            <Button size="sm" variant="outline" onClick={() => store.newConversation(store.draft)}>
              <Plus className="h-4 w-4" /> Nuova conversazione
            </Button>
          </div>
        )}
        {(block === null || block === "full") && (
          <>
            {context ? (
              <div className="mb-2 flex items-center gap-2" data-testid="assistant-context">
                <span className="min-w-0 truncate border border-border px-2 py-0.5 font-mono text-[11px]" title={context.label}>
                  {context.label}
                </span>
                <IconButton label="Togli il contesto" onClick={store.removeContext} testId="assistant-context-remove" small>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ) : (
              store.pageContext && (
                <button
                  type="button"
                  onClick={store.restoreContext}
                  className="mb-2 font-mono text-[11px] text-muted-foreground underline underline-offset-2"
                  data-testid="assistant-context-restore"
                >
                  Usa il contesto della pagina
                </button>
              )
            )}
            <Composer
              ref={composerRef}
              disabled={block === "full"}
              busy={busy}
              onSend={store.ask}
              onStop={store.stop}
            />
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{DISCLAIMER}</span>
              {usageText(status) && (
                <span className="font-mono" data-testid="assistant-usage" title="Domande usate oggi">
                  {usageText(status)}
                </span>
              )}
            </div>
          </>
        )}
      </footer>
    </section>
  );
}

const Composer = React.forwardRef<
  HTMLTextAreaElement,
  { disabled: boolean; busy: boolean; onSend: (text: string) => void; onStop: () => void }
>(function Composer({ disabled, busy, onSend, onStop }, ref) {
  const { draft, setDraft } = useAssistant();
  const tooLong = draft.length > MAX_TEXT;
  const canSend = !disabled && !busy && draft.trim() !== "" && !tooLong;

  const send = () => {
    if (canSend) onSend(draft);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex flex-wrap items-end gap-2"
      data-testid="assistant-composer"
    >
      <label htmlFor="assistant-text" className="sr-only">
        Domanda per l&apos;assistente
      </label>
      <Textarea
        id="assistant-text"
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter is a new line; never while an IME is composing.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder="Chiedi sulle pratiche che puoi vedere…"
        className="max-h-40 min-h-[44px] flex-1 resize-none"
        aria-invalid={tooLong || undefined}
        aria-describedby={tooLong ? "assistant-too-long" : undefined}
        disabled={disabled}
      />
      {busy ? (
        <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Interrompi" title="Interrompi" data-testid="assistant-stop">
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Invia" title="Invia" data-testid="assistant-send">
          <Send className="h-4 w-4" />
        </Button>
      )}
      {tooLong && (
        <p id="assistant-too-long" className="w-full text-xs text-status-error" data-testid="assistant-too-long">
          Massimo {MAX_TEXT} caratteri ({draft.length}).
        </p>
      )}
    </form>
  );
});

function TurnBlock({ turn, onNavigate, onFill }: { turn: Turn; onNavigate?: () => void; onFill: (text: string) => void }) {
  const { ask, busy, newConversation } = useAssistant();
  const working = turn.phase === "sending" || turn.phase === "reading" || turn.phase === "answering";
  const done = turn.done;
  const stateNotice = done ? answerStateNotice(done.answerState, done.truncated || done.finishReason === "LENGTH") : null;
  const byIndex = new Map(turn.sources.map((s) => [s.index, s.source]));

  return (
    <li className="space-y-3" data-testid="assistant-turn" data-phase={turn.phase}>
      <div className="border-l-2 border-foreground pl-3">
        <p className={LABEL}>
          Domanda · {romeTime(turn.askedAt)}
          {turn.contextLabel ? ` · ${turn.contextLabel}` : ""}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{turn.question}</p>
      </div>

      <div className="border border-border px-3 py-3" aria-busy={working || undefined}>
        <p className={LABEL}>
          Risposta{done ? ` · ${romeTime(done.asOf)}` : ""}
          {turn.phase === "aborted" || turn.phase === "interrupted" || (turn.phase === "error" && turn.text) ? " · incompleta" : ""}
        </p>

        {working && !turn.text && (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="assistant-status">
            {turn.statusText ?? (turn.phase === "sending" ? "Invio della domanda…" : "Leggo i dati…")}
            {turn.statusPeriod ? ` (${periodText(turn.statusPeriod)})` : ""}
          </p>
        )}

        {turn.text && (
          <div className="mt-2 space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]" data-testid="assistant-answer">
            {answerBlocks(turn.text).map((b, i) => {
              const runs = (rs: Run[]) => <Runs runs={rs} sources={byIndex} onNavigate={onNavigate} onFill={onFill} />;
              if (b.kind === "p") {
                return (
                  <p key={i} className={cn("whitespace-pre-wrap", b.heading && "font-semibold")}>
                    {runs(b.runs)}
                  </p>
                );
              }
              const List = b.kind;
              return (
                <List key={i} className={cn("space-y-1 pl-5", b.kind === "ul" ? "list-disc" : "list-decimal")}>
                  {b.items.map((item, j) => (
                    <li key={j}>{runs(item)}</li>
                  ))}
                </List>
              );
            })}
          </div>
        )}

        {working && turn.text && turn.statusText && (
          <p className="mt-2 text-xs text-muted-foreground">{turn.statusText}</p>
        )}

        {turn.facts.length > 0 && <Facts facts={turn.facts} sources={byIndex} onNavigate={onNavigate} onFill={onFill} />}
        {turn.sources.length > 0 && <Sources sources={turn.sources} onNavigate={onNavigate} onFill={onFill} />}

        {stateNotice && <NoticeBox notice={stateNotice} className="mt-3" testId="assistant-state" />}
        {turn.notice && (
          <NoticeBox notice={turn.notice} className="mt-3" testId="assistant-error">
            {turn.notice.action === "retry" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => ask(turn.question)} data-testid="assistant-retry">
                Riprova
              </Button>
            )}
            {turn.notice.action === "new-conversation" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => newConversation(turn.question)} data-testid="assistant-new-conversation">
                <Plus className="h-4 w-4" /> Nuova conversazione
              </Button>
            )}
            {turn.notice.action === "login" && (
              <Button size="sm" variant="outline" asChild>
                <a href="/login">Accedi</a>
              </Button>
            )}
          </NoticeBox>
        )}

        {done && (
          <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground" data-testid="assistant-read-at">
            {readAtText(done.readStartedAt, done.asOf)} · {DISCLAIMER}
          </p>
        )}
      </div>
    </li>
  );
}

type SourceLinkProps = { onNavigate?: () => void; onFill: (text: string) => void };

/** QUERY reopens the question in the composer (never sent by itself); the others are links. */
function SourceLink({ source, className, children, onNavigate, onFill }: SourceLinkProps & { source: AssistantSourceDTO; className?: string; children: React.ReactNode }) {
  if (source.kind === "QUERY") {
    return (
      <button type="button" className={className} onClick={() => onFill(source.question)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={sourceHref(source)} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}

/** Plain and bold runs of the answer; [n] become links to source n. */
function Runs({ runs, sources, ...rest }: SourceLinkProps & { runs: Run[]; sources: Map<number, AssistantSourceDTO> }) {
  return (
    <>
      {runs.map((run, i) => {
        const parts = run.parts.map((part, j) =>
          typeof part === "number" ? (
            <Citation key={j} n={part} source={sources.get(part)} {...rest} />
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          )
        );
        return run.strong ? <strong key={i} className="font-semibold">{parts}</strong> : <React.Fragment key={i}>{parts}</React.Fragment>;
      })}
    </>
  );
}

function Citation({ n, source, ...rest }: SourceLinkProps & { n: number; source?: AssistantSourceDTO }) {
  if (!source) return <>[{n}]</>;
  return (
    <SourceLink
      source={source}
      {...rest}
      className="mx-0.5 inline-block border border-border px-1 font-mono text-[11px] leading-4 no-underline hover:bg-accent"
    >
      <span aria-label={`Fonte ${n}: ${source.label}`}>{n}</span>
    </SourceLink>
  );
}

function Sources({ sources, ...rest }: SourceLinkProps & { sources: Turn["sources"] }) {
  return (
    <div className="mt-3" data-testid="assistant-sources">
      <p className={LABEL}>Fonti</p>
      <ul className="mt-1 space-y-1">
        {sources.map(({ index, source }) => (
          <li key={index}>
            <SourceLink source={source} {...rest} className="flex w-full items-baseline gap-2 border border-border px-2 py-1.5 text-left text-xs hover:bg-accent">
              <span className="shrink-0 font-mono">[{index}]</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-medium">{source.label}</span>
                {sourceDetail(source) && <span className="text-muted-foreground"> · {sourceDetail(source)}</span>}
              </span>
            </SourceLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NUMBER = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

function Facts({ facts, sources, ...rest }: SourceLinkProps & { facts: AssistantFactDTO[]; sources: Map<number, AssistantSourceDTO> }) {
  return (
    <div className="mt-3 overflow-x-auto" data-testid="assistant-facts">
      <p className={LABEL}>Dati dell&apos;app</p>
      <table className="mt-1 w-full border-collapse text-xs">
        <tbody>
          {facts.map((f) => {
            const source = sources.get(f.sourceIndex);
            return (
              <tr key={f.key} className="border border-border">
                <th scope="row" className="px-2 py-1.5 text-left font-normal [overflow-wrap:anywhere]">
                  {f.label}
                  <span className="block text-muted-foreground">
                    {f.scopeLabel}
                    {f.period ? ` · ${periodText(f.period)}` : ""}
                  </span>
                </th>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-sm">
                  {f.value === null ? "—" : NUMBER.format(f.value)}
                  {f.unit && f.value !== null ? ` ${f.unit}` : ""}
                </td>
                <td className="w-8 px-1 py-1.5 text-right">
                  {source && <Citation n={f.sourceIndex} source={source} {...rest} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TONE: Record<Notice["tone"], string> = {
  error: "border-status-error",
  quota: "border-status-progress",
  neutral: "border-border",
};

function NoticeBox({ notice, className, testId, children }: { notice: Notice; className?: string; testId?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn("space-y-2 border px-3 py-2 text-sm", notice.tone !== "neutral" && "border-l-4", TONE[notice.tone], className)}
      role={notice.tone === "error" ? "alert" : undefined}
      data-testid={testId}
      data-tone={notice.tone}
    >
      <p className={notice.tone === "error" ? "font-medium" : undefined}>{notice.title}</p>
      {notice.detail && <p className="text-xs text-muted-foreground">{notice.detail}</p>}
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  testId,
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={small ? "h-6 w-6" : "h-8 w-8"}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

/** Text for the polite live region: phases and finished blocks, never each token. */
function announcementFor(turn: Turn | undefined): string {
  if (!turn) return "";
  switch (turn.phase) {
    case "sending":
      return "Domanda inviata.";
    case "reading":
      return turn.statusText ?? "Leggo i dati.";
    case "answering":
      return "Risposta in arrivo.";
    case "done": {
      const n = turn.done ? answerStateNotice(turn.done.answerState, turn.done.truncated) : null;
      return n ? `Risposta conclusa. ${n.title}` : "Risposta conclusa.";
    }
    default:
      return turn.notice?.title ?? "";
  }
}
