"use client";
import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import {
  MAX_BODY,
  MAX_MENTIONS,
  mentionBefore,
  mentionQuery,
  mentionToken,
  mentionsInText,
} from "@/components/commenti/comment-text";
import type { CommentMention, MentionableDTO } from "@/components/commenti/types";

/**
 * Comment field (D-184): plain text; "@" opens the menu of groups, "@tutti"
 * and people who see the practice. A chosen entry becomes "@label" in the
 * text and a structured mention; Backspace removes the whole tag. Enter is a
 * new line, Ctrl/Cmd+Enter sends.
 */

type Candidate = { mention: CommentMention; hint: string };

const MAX_SHOWN = 8;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function candidatesOf(m: MentionableDTO | null, query: string): Candidate[] {
  if (!m) return [];
  const q = fold(query.trim());
  const all: Candidate[] = [
    ...m.groups.map((g) => ({ mention: { kind: "group", id: g.id, label: g.label } as CommentMention, hint: "Gruppo" })),
    { mention: { kind: "all", label: m.all.label }, hint: "Tutti sul cliente" },
    ...m.people.map((p) => ({
      mention: { kind: "user", id: p.id, label: p.name } as CommentMention,
      hint: p.groups.map((g) => GROUP_LABEL[g]).join(", "),
    })),
  ];
  return all.filter((c) => fold(mentionToken(c.mention).slice(1)).includes(q)).slice(0, MAX_SHOWN);
}

export function MentionComposer({
  mentionable,
  initialBody = "",
  initialMentions = [],
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
  idPrefix,
}: {
  mentionable: MentionableDTO | null;
  initialBody?: string;
  initialMentions?: CommentMention[];
  placeholder: string;
  submitLabel: string;
  /** Throws to keep the text (the error is shown by the caller). */
  onSubmit: (body: string, mentions: CommentMention[]) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  idPrefix: string;
}) {
  const [body, setBody] = React.useState(initialBody);
  const [mentions, setMentions] = React.useState<CommentMention[]>(initialMentions);
  const [menu, setMenu] = React.useState<{ start: number; query: string; active: number } | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  /** Where the caret goes after a programmatic change of the text: set before the next key, not a frame later. */
  const nextCaret = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (nextCaret.current === null || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(nextCaret.current, nextCaret.current);
    nextCaret.current = null;
  }, [body]);

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const candidates = menu ? candidatesOf(mentionable, menu.query) : [];
  const open = !!menu && candidates.length > 0;
  const active = mentionsInText(body, mentions);
  const listId = `${idPrefix}-mentions`;

  function refreshMenu(text: string, caret: number) {
    const q = mentionQuery(text, caret);
    setMenu(q ? { start: q.start, query: q.query, active: 0 } : null);
  }

  function choose(c: Candidate) {
    if (!menu || !ref.current) return;
    const caret = ref.current.selectionStart ?? body.length;
    const token = `${mentionToken(c.mention)} `;
    const next = body.slice(0, menu.start) + token + body.slice(caret);
    const pos = menu.start + token.length;
    nextCaret.current = pos;
    setBody(next);
    setMentions((list) => [...list, c.mention]);
    setMenu(null);
  }

  function removeMention(m: CommentMention) {
    const next = body.split(`${mentionToken(m)} `).join("").split(mentionToken(m)).join("");
    setBody(next);
    setMentions((list) => list.filter((x) => x !== m));
  }

  async function submit() {
    const text = body.trim();
    const sent = mentionsInText(text, mentions);
    if (!text) return setError("Scrivi il testo del commento.");
    if (text.length > MAX_BODY) return setError(`Massimo ${MAX_BODY.toLocaleString("it-IT")} caratteri.`);
    if (sent.length > MAX_MENTIONS) return setError(`Massimo ${MAX_MENTIONS} menzioni per commento.`);
    setSending(true);
    setError(null);
    try {
      await onSubmit(text, sent);
      setBody("");
      setMentions([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setMenu((m) => (m ? { ...m, active: (m.active + step + candidates.length) % candidates.length } : m));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(candidates[menu!.active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === "Backspace") {
      const t = e.currentTarget;
      if (t.selectionStart !== t.selectionEnd) return;
      const range = mentionBefore(body, t.selectionStart, mentions);
      if (range) {
        e.preventDefault();
        nextCaret.current = range.start;
        setBody(body.slice(0, range.start) + body.slice(range.end));
      }
    }
  }

  return (
    <div className="space-y-2" data-testid={`${idPrefix}-composer`}>
      <div className="relative">
        <label htmlFor={`${idPrefix}-text`} className="sr-only">
          {placeholder}
        </label>
        <Textarea
          id={`${idPrefix}-text`}
          ref={ref}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            refreshMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          placeholder={placeholder}
          rows={3}
          className="resize-y"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${menu!.active}` : undefined}
          disabled={sending}
          data-testid={`${idPrefix}-text`}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Menziona"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto border border-border bg-popover shadow-md"
            data-testid={`${idPrefix}-menu`}
          >
            {candidates.map((c, i) => (
              <li
                key={`${c.mention.kind}:${"id" in c.mention ? c.mention.id : "all"}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === menu!.active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
                  i === menu!.active ? "bg-accent" : "hover:bg-accent"
                )}
              >
                <span className="font-mono">{mentionToken(c.mention)}</span>
                <span className="truncate text-xs text-muted-foreground">{c.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${idPrefix}-mentioned`}>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Menzionati</span>
          {active.map((m) => (
            <span key={`${m.kind}:${"id" in m ? m.id : "all"}`} className="inline-flex items-center gap-1 border border-border px-1.5 font-mono text-[11px]">
              {mentionToken(m)}
              <button type="button" onClick={() => removeMention(m)} aria-label={`Togli la menzione ${mentionToken(m).slice(1)}`} className="hover:text-status-error">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-status-error" role="alert" data-testid={`${idPrefix}-error`}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Scrivi @ per menzionare un gruppo, tutti o una persona.</span>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={sending}>
              Annulla
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => void submit()} disabled={sending || !body.trim()} data-testid={`${idPrefix}-submit`}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
