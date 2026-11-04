import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CommentDTO, CommentListResponse, CommentMention, MentionableDTO } from "@/lib/contract";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const source = vi.hoisted(() => ({
  loadComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  loadMentionable: vi.fn(),
}));
vi.mock("@/components/commenti/comments-source", () => source);

import { ApiError } from "@/lib/client";
import { mentionBefore, mentionQuery, mentionToken, mentionsInText, splitMentions, toBlocks } from "@/components/commenti/comment-text";
import { candidatesOf, MentionComposer } from "@/components/commenti/mention-composer";
import { CommentsPanel, commentErrorMessage, countComments } from "@/components/commenti/comments-panel";

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const UT: CommentMention = { kind: "group", id: "UT_PE", label: "UT/PE" };
const ALL: CommentMention = { kind: "all", label: "tutti" };
const MARIO: CommentMention = { kind: "user", id: "a".repeat(24), label: "Mario Rossi" };

const MENTIONABLE: MentionableDTO = {
  groups: [
    { id: "PM_PERMESSI", label: "PM/Permessi" },
    { id: "UT_PE", label: "UT/PE" },
  ],
  all: { label: "tutti" },
  people: [
    { id: "a".repeat(24), name: "Mario Rossi", groups: ["UT_PE"] },
    { id: "b".repeat(24), name: "Lucia Bianchi", groups: ["DL"] },
  ],
};

function comment(over: Partial<CommentDTO> = {}): CommentDTO {
  return {
    id: "c1", practiceId: "p1", iteration: 1, parentId: null, author: { id: "u1", name: "Anna Verdi" },
    body: "Serve il verbale @UT/PE", mentions: [UT], createdAt: "2026-10-10T09:30:00+02:00", editedAt: null,
    deleted: false, canEdit: true, canDelete: true, replies: [], ...over,
  };
}

const list = (items: CommentDTO[], extra: Partial<CommentListResponse> = {}): CommentListResponse => ({ items, canComment: true, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  source.loadMentionable.mockResolvedValue(MENTIONABLE);
});

describe("comment text (plain text, never markup)", () => {
  it("splits on the mentions only, longest label first", () => {
    const UTE: CommentMention = { kind: "group", id: "UT_PE", label: "UT" };
    expect(splitMentions("ciao @UT/PE e @UT, non @altro", [UTE, UT])).toEqual([
      { kind: "text", text: "ciao " },
      { kind: "mention", mention: UT },
      { kind: "text", text: " e " },
      { kind: "mention", mention: UTE },
      { kind: "text", text: ", non @altro" },
    ]);
  });

  it("labels from the server carry their '@' (v0.5.2): one '@' in the text either way", () => {
    const fromServer: CommentMention = { kind: "user", id: "a".repeat(24), label: "@Prova carico 01" };
    expect(mentionToken(fromServer)).toBe("@Prova carico 01");
    expect(mentionToken(MARIO)).toBe("@Mario Rossi");
    expect(splitMentions("@Prova carico 01 puoi?", [fromServer])).toEqual([{ kind: "mention", mention: fromServer }, { kind: "text", text: " puoi?" }]);
    expect(mentionsInText("ok @Prova carico 01", [fromServer])).toEqual([fromServer]);
    expect(mentionBefore("ok @Prova carico 01 ", 20, [fromServer])).toEqual({ start: 3, end: 20 });
  });

  it("paragraphs and '- ' lists; HTML stays text", () => {
    const blocks = toBlocks("Primo\nsegue\n\n- uno\n• due\n<b>x</b>", []);
    expect(blocks).toEqual([
      { kind: "paragraph", pieces: [{ kind: "text", text: "Primo\nsegue" }] },
      { kind: "list", items: [[{ kind: "text", text: "uno" }], [{ kind: "text", text: "due" }]] },
      { kind: "paragraph", pieces: [{ kind: "text", text: "<b>x</b>" }] },
    ]);
  });

  it("sends only the mentions still in the text, once each", () => {
    expect(mentionsInText("ok @tutti @tutti", [ALL, ALL, UT])).toEqual([ALL]);
  });

  it("the '@' being typed: not inside an e-mail, not across lines", () => {
    expect(mentionQuery("ciao @Mar", 9)).toEqual({ start: 5, query: "Mar" });
    expect(mentionQuery("(@UT", 4)).toEqual({ start: 1, query: "UT" });
    expect(mentionQuery("mario@hqe.it", 12)).toBeNull();
    expect(mentionQuery("@UT\nx", 5)).toBeNull();
  });

  it("Backspace after a tag removes it whole, with its space", () => {
    expect(mentionBefore("vedi @Mario Rossi ", 18, [MARIO])).toEqual({ start: 5, end: 18 });
    expect(mentionBefore("vedi @Mario Rossi", 17, [MARIO])).toEqual({ start: 5, end: 17 });
    expect(mentionBefore("vedi Mario", 10, [MARIO])).toBeNull();
  });
});

describe("MentionComposer", () => {
  it("candidates: groups, everyone, people; accent-insensitive", () => {
    expect(candidatesOf(MENTIONABLE, "").map((c) => c.mention.label)).toEqual(["PM/Permessi", "UT/PE", "tutti", "Mario Rossi", "Lucia Bianchi"]);
    expect(candidatesOf(MENTIONABLE, "lucìa").map((c) => c.hint)).toEqual(["DL"]);
    expect(candidatesOf(null, "x")).toEqual([]);
  });

  it("server labels with '@' show one '@' in the menu and in the text", () => {
    const withAt: MentionableDTO = { ...MENTIONABLE, groups: [{ id: "UT_PE", label: "@UT/PE" }], all: { label: "@tutti" } };
    render(<MentionComposer mentionable={withAt} placeholder="p" submitLabel="Commenta" onSubmit={vi.fn()} idPrefix="t" />);
    const text = screen.getByTestId("t-text") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "@ut", selectionStart: 3 } });
    expect(within(screen.getByTestId("t-menu")).getAllByRole("option")[0]).toHaveTextContent(/^@UT\/PE/);
    fireEvent.keyDown(text, { key: "Enter" });
    expect(text.value).toBe("@UT/PE ");
  });

  it("after picking a tag the caret is already after it, before the next key", () => {
    render(<MentionComposer mentionable={MENTIONABLE} placeholder="p" submitLabel="Commenta" onSubmit={vi.fn()} idPrefix="t" />);
    const text = screen.getByTestId("t-text") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "Vedi @mar e poi", selectionStart: 9 } });
    fireEvent.keyDown(text, { key: "Enter" });
    expect(text.value).toBe("Vedi @Mario Rossi  e poi");
    expect(text.selectionStart).toBe("Vedi @Mario Rossi ".length);
  });

  it("'@' opens the menu, Enter picks a tag, Ctrl+Enter sends text and mentions", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<MentionComposer mentionable={MENTIONABLE} placeholder="Aggiungi un commento" submitLabel="Commenta" onSubmit={onSubmit} idPrefix="t" />);
    const text = screen.getByTestId("t-text") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "Vedi @mar", selectionStart: 9 } });
    const menu = screen.getByTestId("t-menu");
    expect(within(menu).getAllByRole("option")).toHaveLength(1);
    expect(text).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(text, { key: "Enter" });
    expect(text.value).toBe("Vedi @Mario Rossi ");
    expect(screen.getByTestId("t-mentioned")).toHaveTextContent("@Mario Rossi");
    fireEvent.change(text, { target: { value: "Vedi @Mario Rossi grazie", selectionStart: 24 } });
    fireEvent.keyDown(text, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Vedi @Mario Rossi grazie", [MARIO]));
    await waitFor(() => expect(text.value).toBe(""));
  });

  it("refuses an empty text; a failed send keeps the text and shows why", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("Pratica archiviata: i commenti sono in sola lettura.");
    });
    render(<MentionComposer mentionable={MENTIONABLE} placeholder="p" submitLabel="Commenta" onSubmit={onSubmit} idPrefix="t" />);
    const text = screen.getByTestId("t-text") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "   " } });
    fireEvent.keyDown(text, { key: "Enter", ctrlKey: true });
    expect(await screen.findByTestId("t-error")).toHaveTextContent("Scrivi il testo del commento.");
    fireEvent.change(text, { target: { value: "Testo" } });
    fireEvent.click(screen.getByTestId("t-submit"));
    expect(await screen.findByTestId("t-error")).toHaveTextContent("Pratica archiviata");
    expect(text.value).toBe("Testo");
  });
});

describe("CommentsPanel", () => {
  it("shows comments with mention tags, replies, edits and deletions; counts what is not deleted", async () => {
    const onCount = vi.fn();
    source.loadComments.mockResolvedValue(
      list([
        comment({
          editedAt: "2026-10-10T10:00:00+02:00",
          replies: [
            comment({ id: "c2", parentId: "c1", author: { id: "u2", name: "Mario Rossi" }, body: "Fatto", mentions: [], canEdit: false, canDelete: false }),
            comment({ id: "c3", parentId: "c1", deleted: true, body: "", mentions: [], deletedByName: "Admin", canEdit: false, canDelete: false }),
          ],
        }),
      ])
    );
    render(<CommentsPanel practiceId="p1" iteration={1} onCount={onCount} />);
    const first = await screen.findByText(/Serve il verbale/);
    expect(screen.getByRole("heading", { name: /Commenti \(2\)/ })).toBeInTheDocument();
    expect(onCount).toHaveBeenCalledWith(2);
    expect(source.loadComments).toHaveBeenCalledWith("p1", { iteration: 1 });
    expect(within(first).getByTestId("comment-mention")).toHaveTextContent("@UT/PE");
    expect(screen.getByText(/modificato/)).toBeInTheDocument();
    expect(screen.getByTestId("comment-deleted")).toHaveTextContent("Commento eliminato da Admin");
    // Replies have no "Rispondi"; others' comments have no Modifica/Elimina.
    expect(screen.getAllByTestId("comment-reply")).toHaveLength(1);
    expect(screen.getAllByTestId("comment-edit")).toHaveLength(1);
    expect(screen.getByTestId("comment-new-composer")).toBeInTheDocument();
  });

  it("posts a reply to the root comment and reloads", async () => {
    source.loadComments.mockResolvedValue(list([comment()]));
    source.createComment.mockResolvedValue(comment({ id: "c9" }));
    render(<CommentsPanel practiceId="p1" iteration={1} />);
    fireEvent.click(await screen.findByTestId("comment-reply"));
    const text = await screen.findByTestId("comment-reply-c1-text");
    fireEvent.change(text, { target: { value: "Ok" } });
    fireEvent.click(screen.getByTestId("comment-reply-c1-submit"));
    await waitFor(() => expect(source.createComment).toHaveBeenCalledWith("p1", "Ok", [], "c1"));
    expect(toast.success).toHaveBeenCalledWith("Risposta pubblicata");
    expect(source.loadComments).toHaveBeenCalledTimes(2);
  });

  it("an edit of a comment deleted meanwhile says so (409 DELETED)", async () => {
    source.loadComments.mockResolvedValue(list([comment()]));
    source.updateComment.mockRejectedValue(new ApiError("Il commento è stato eliminato", 409, { code: "DELETED" }));
    render(<CommentsPanel practiceId="p1" iteration={1} />);
    fireEvent.click(await screen.findByTestId("comment-edit"));
    fireEvent.click(screen.getByTestId("comment-edit-c1-submit"));
    expect(await screen.findByTestId("comment-edit-c1-error")).toHaveTextContent("Il commento è stato eliminato nel frattempo.");
  });

  it("read-only on a past iteration: the reason, no composer, no actions", async () => {
    source.loadComments.mockResolvedValue(list([comment()], { canComment: false, reason: "PAST_ITERATION" }));
    render(<CommentsPanel practiceId="p1" iteration={1} />);
    expect(await screen.findByTestId("comments-read-only")).toHaveTextContent("Iterazione passata: i commenti sono in sola lettura.");
    expect(screen.queryByTestId("comment-new-composer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("comment-delete")).not.toBeInTheDocument();
  });

  it("a failed read shows why and Riprova", async () => {
    source.loadComments.mockRejectedValueOnce(new ApiError("x", 500, {})).mockResolvedValueOnce(list([]));
    render(<CommentsPanel practiceId="p1" iteration={1} />);
    expect(await screen.findByTestId("comments-load-error")).toHaveTextContent("Errore del server");
    fireEvent.click(screen.getByTestId("comments-load-error-retry"));
    expect(await screen.findByTestId("comments-empty")).toBeInTheDocument();
  });

  it("opens on the comment of a MENTION and highlights it", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    source.loadComments.mockResolvedValue(list([comment({ replies: [comment({ id: "c2", parentId: "c1", body: "Qui", mentions: [] })] })]));
    render(<CommentsPanel practiceId="p1" iteration={1} focusCommentId="c2" />);
    await screen.findByText("Qui");
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(document.getElementById("commento-c2")?.className).toMatch(/ring-2/);
  });

  it("deletes after confirmation", async () => {
    source.loadComments.mockResolvedValue(list([comment()]));
    source.deleteComment.mockResolvedValue(undefined);
    render(<CommentsPanel practiceId="p1" iteration={1} />);
    fireEvent.click(await screen.findByTestId("comment-delete"));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    });
    await waitFor(() => expect(source.deleteComment).toHaveBeenCalledWith("p1", "c1"));
  });

  it("error texts and counts", () => {
    expect(commentErrorMessage(new ApiError("x", 409, { code: "ARCHIVED" }))).toMatch(/archiviata/);
    expect(commentErrorMessage(new ApiError("x", 422, {}))).toMatch(/menzione non valida/);
    expect(countComments([comment({ deleted: true, replies: [comment({ id: "r" })] })])).toBe(1);
  });
});
