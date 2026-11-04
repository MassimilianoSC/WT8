"use client";
import * as React from "react";
import { format } from "date-fns";
import { MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/layout/use-confirm";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import { MentionComposer } from "@/components/commenti/mention-composer";
import { mentionToken, toBlocks, type TextPiece } from "@/components/commenti/comment-text";
import {
  createComment,
  deleteComment,
  loadComments,
  loadMentionable,
  updateComment,
} from "@/components/commenti/comments-source";
import type { CommentDTO, CommentListResponse, CommentMention, MentionableDTO } from "@/components/commenti/types";

/**
 * "COMMENTI (n)" on the sheet, above the history (D-184, D-185): anyone who
 * sees the practice reads; replies on one level; the author edits; author or
 * ADMIN delete. Read-only on archived practices and past iterations.
 */

export const COMMENTS_ANCHOR = "commenti";
export const commentAnchor = (id: string) => `commento-${id}`;

const READ_ONLY: Record<NonNullable<CommentListResponse["reason"]>, string> = {
  ARCHIVED: "Pratica archiviata: i commenti sono in sola lettura.",
  PAST_ITERATION: "Iterazione passata: i commenti sono in sola lettura.",
};

/** Fixed Italian texts by status and code (never the server's text). */
export function commentErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Non è stato possibile salvare il commento. Riprova tra poco.";
  const code = (e.body as { code?: string } | null)?.code;
  if (code === "ARCHIVED") return READ_ONLY.ARCHIVED;
  if (code === "PAST_ITERATION") return READ_ONLY.PAST_ITERATION;
  if (code === "DELETED") return "Il commento è stato eliminato nel frattempo.";
  if (e.status === 422) return "Testo vuoto, troppo lungo o menzione non valida.";
  if (e.status === 403) return "Non puoi modificare o eliminare questo commento.";
  if (e.status === 404) return "Commento non trovato: forse è stato eliminato.";
  if (e.status === 401) return "Sessione scaduta: accedi di nuovo.";
  return "Non è stato possibile salvare il commento. Riprova tra poco.";
}

export function countComments(items: CommentDTO[]): number {
  return items.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.filter((r) => !r.deleted).length, 0);
}

export function CommentsPanel({
  practiceId,
  iteration,
  onCount,
  focusCommentId,
}: {
  practiceId: string;
  /** Iteration on screen; comments are bound to it (§14). */
  iteration: number;
  onCount?: (n: number) => void;
  /** From a MENTION notification: scroll to it and highlight it. */
  focusCommentId?: string;
}) {
  const [data, setData] = React.useState<CommentListResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [all, setAll] = React.useState(false);
  const [mentionable, setMentionable] = React.useState<MentionableDTO | null>(null);
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const focused = React.useRef<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const res = await loadComments(practiceId, all ? { all: true } : { iteration });
      setData(res);
      setLoadError(null);
      // The header mark counts the iteration on screen, not every iteration.
      if (!all) onCount?.(countComments(res.items));
    } catch (e) {
      setLoadError(loadErrorMessage(e));
    }
  }, [practiceId, iteration, all, onCount]);

  const firstLoad = React.useCallback(() => {
    setData(null);
    setLoadError(null);
    void reload();
  }, [reload]);
  React.useEffect(firstLoad, [firstLoad]);

  React.useEffect(() => {
    loadMentionable(practiceId).then(setMentionable).catch(() => setMentionable(null));
  }, [practiceId]);

  // A mention notification opens the sheet on its comment.
  React.useEffect(() => {
    if (!focusCommentId || !data || focused.current === focusCommentId) return;
    const el = document.getElementById(commentAnchor(focusCommentId));
    if (!el) return;
    focused.current = focusCommentId;
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setHighlight(focusCommentId);
  }, [focusCommentId, data]);

  React.useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
  }, [highlight]);

  const run = async (op: () => Promise<unknown>, done: string) => {
    try {
      await op();
      toast.success(done);
      await reload();
    } catch (e) {
      throw new Error(commentErrorMessage(e));
    }
  };

  const post = (body: string, mentions: CommentMention[], parentId?: string) =>
    run(() => createComment(practiceId, body, mentions, parentId), parentId ? "Risposta pubblicata" : "Commento pubblicato").then(() => setReplyTo(null));
  const save = (id: string) => (body: string, mentions: CommentMention[]) =>
    run(() => updateComment(practiceId, id, body, mentions), "Commento aggiornato").then(() => setEditing(null));
  async function remove(c: CommentDTO) {
    const ok = await confirm({ title: "Eliminare il commento?", description: "Resta la scritta \"Commento eliminato\"; le risposte restano.", confirmLabel: "Elimina", destructive: true });
    if (!ok) return;
    try {
      await run(() => deleteComment(practiceId, c.id), "Commento eliminato");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const items = data?.items ?? [];
  const n = countComments(items);
  const canComment = !!data?.canComment && !all;

  const renderComment = (c: CommentDTO, reply: boolean) => (
    <article
      key={c.id}
      id={commentAnchor(c.id)}
      className={cn("space-y-1.5 scroll-mt-24", reply ? "border-l border-border pl-4" : "", highlight === c.id && "ring-2 ring-primary ring-offset-4 ring-offset-card")}
      data-testid="comment"
    >
      <header className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <span className="text-foreground">{c.author.name}</span>
        <span>· {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm")}</span>
        {c.editedAt && !c.deleted && <span>· modificato</span>}
        {all && <span>· iterazione {c.iteration}</span>}
      </header>
      {c.deleted ? (
        <p className="text-sm italic text-muted-foreground" data-testid="comment-deleted">
          Commento eliminato{c.deletedByName ? ` da ${c.deletedByName}` : ""}
        </p>
      ) : editing === c.id ? (
        <MentionComposer
          mentionable={mentionable}
          initialBody={c.body}
          initialMentions={c.mentions}
          placeholder="Modifica il commento"
          submitLabel="Salva"
          onSubmit={save(c.id)}
          onCancel={() => setEditing(null)}
          autoFocus
          idPrefix={`comment-edit-${c.id}`}
        />
      ) : (
        <CommentBody body={c.body} mentions={c.mentions} />
      )}
      {/* Read-only (archived, past iteration, every iteration): no actions at all. */}
      {!c.deleted && editing !== c.id && canComment && (
        <div className="flex gap-4">
          {!reply && (
            <ActionButton onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} testId="comment-reply">
              <Reply className="h-3 w-3" /> Rispondi
            </ActionButton>
          )}
          {c.canEdit && (
            <ActionButton onClick={() => setEditing(c.id)} testId="comment-edit">
              <Pencil className="h-3 w-3" /> Modifica
            </ActionButton>
          )}
          {c.canDelete && (
            <ActionButton onClick={() => void remove(c)} testId="comment-delete">
              <Trash2 className="h-3 w-3" /> Elimina
            </ActionButton>
          )}
        </div>
      )}
    </article>
  );

  return (
    <section id={COMMENTS_ANCHOR} className="scroll-mt-24 border border-border bg-card" aria-labelledby="comments-title" data-testid="comments-panel">
      {confirmDialog}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="comments-title" className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
          <MessageSquare className="h-4 w-4" /> Commenti ({n})
        </h2>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} data-testid="comments-all" />
          Tutte le iterazioni
        </label>
      </header>
      <div className="space-y-5 p-4">
        {loadError ? (
          <LoadError message={loadError} onRetry={firstLoad} className="p-0" testId="comments-load-error" />
        ) : data === null ? (
          <p className="font-mono text-xs text-muted-foreground">Caricamento…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="comments-empty">Nessun commento.</p>
        ) : (
          <ol className="space-y-5">
            {items.map((c) => (
              <li key={c.id} className="space-y-3">
                {renderComment(c, false)}
                {c.replies.length > 0 && <div className="ml-4 space-y-3">{c.replies.map((r) => renderComment(r, true))}</div>}
                {replyTo === c.id && (
                  <div className="ml-4 border-l border-border pl-4">
                    <MentionComposer
                      mentionable={mentionable}
                      placeholder="Scrivi una risposta"
                      submitLabel="Rispondi"
                      onSubmit={(body, mentions) => post(body, mentions, c.id)}
                      onCancel={() => setReplyTo(null)}
                      autoFocus
                      idPrefix={`comment-reply-${c.id}`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {data && !all && !data.canComment && (
          <p className="border-l-4 border-border px-3 py-1 text-sm text-muted-foreground" data-testid="comments-read-only">
            {READ_ONLY[data.reason ?? "PAST_ITERATION"]}
          </p>
        )}
        {canComment && (
          <div className="border-t border-border pt-4">
            <MentionComposer
              mentionable={mentionable}
              placeholder="Aggiungi un commento"
              submitLabel="Commenta"
              onSubmit={(body, mentions) => post(body, mentions)}
              idPrefix="comment-new"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function CommentBody({ body, mentions }: { body: string; mentions: CommentMention[] }) {
  return (
    <div className="space-y-2 text-sm [overflow-wrap:anywhere]" data-testid="comment-body">
      {toBlocks(body, mentions).map((b, i) =>
        b.kind === "paragraph" ? (
          <p key={i} className="whitespace-pre-wrap">
            <Pieces pieces={b.pieces} />
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Pieces pieces={it} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Pieces({ pieces }: { pieces: TextPiece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.kind === "text" ? (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ) : (
          <span key={i} className="mx-0.5 inline-block border border-border px-1 font-mono text-[11px] leading-4" data-testid="comment-mention">
            {mentionToken(p.mention)}
          </span>
        )
      )}
    </>
  );
}

function ActionButton({ onClick, testId, children }: { onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      data-testid={testId}
    >
      {children}
    </button>
  );
}
