import type { CommentMention } from "@/components/commenti/types";

/**
 * Comment text (contract §14, D-184): plain text, never HTML. A mention is
 * "@<label>" in the body plus an entry in `mentions`; an "@word" that is not
 * in the list stays plain text. Nothing here produces markup: the component
 * renders the pieces as React text, mention tags and list items.
 */

export const MAX_BODY = 10_000;
export const MAX_MENTIONS = 20;

export type TextPiece = { kind: "text"; text: string } | { kind: "mention"; mention: CommentMention };
export type Block = { kind: "paragraph"; pieces: TextPiece[] } | { kind: "list"; items: TextPiece[][] };

const key = (m: CommentMention) => (m.kind === "all" ? "all" : `${m.kind}:${m.id}`);

/**
 * "@label" as written in the text. The label carries its "@" (contract v0.5.2:
 * "@UT/PE", "@tutti", "@Nome"); a person picked from /mentionable has just the
 * name. Both forms give one "@".
 */
export const mentionToken = (m: Pick<CommentMention, "label">) => `@${m.label.replace(/^@+/, "")}`;

/** Splits a line on the "@label" of the given mentions (longest label first, so "@UT/PE" wins over "@UT"). */
export function splitMentions(line: string, mentions: CommentMention[]): TextPiece[] {
  const sorted = [...mentions].sort((a, b) => mentionToken(b).length - mentionToken(a).length);
  const out: TextPiece[] = [];
  let rest = line;
  while (rest.length > 0) {
    let best: { at: number; m: CommentMention } | null = null;
    for (const m of sorted) {
      const at = rest.indexOf(mentionToken(m));
      if (at >= 0 && (best === null || at < best.at)) best = { at, m };
    }
    if (!best) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (best.at > 0) out.push({ kind: "text", text: rest.slice(0, best.at) });
    out.push({ kind: "mention", mention: best.m });
    rest = rest.slice(best.at + mentionToken(best.m).length);
  }
  return out;
}

/** Paragraphs and "- " bullet lists; blank lines separate paragraphs. */
export function toBlocks(body: string, mentions: CommentMention[]): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", pieces: splitMentions(paragraph.join("\n"), mentions) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: "list", items: list.map((l) => splitMentions(l, mentions)) });
    list = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(raw);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else if (raw.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(raw);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The mentions still present in the text, once each: a tag deleted from the text is not sent. */
export function mentionsInText(body: string, mentions: CommentMention[]): CommentMention[] {
  const seen = new Set<string>();
  const out: CommentMention[] = [];
  for (const m of mentions) {
    if (seen.has(key(m)) || !body.includes(mentionToken(m))) continue;
    seen.add(key(m));
    out.push(m);
  }
  return out;
}

/**
 * The "@query" being typed just before the caret, or null. Labels have spaces
 * ("Mario Rossi"), so the query may too, but not a line break or more than 40 characters.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s|\(/.test(before[at - 1])) return null; // an e-mail address, not a mention
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.length > 40) return null;
  return { start: at, query };
}

/** Backspace right after a whole "@label": the range to delete, so the tag goes away in one go. */
export function mentionBefore(text: string, caret: number, mentions: CommentMention[]): { start: number; end: number } | null {
  for (const m of [...mentions].sort((a, b) => mentionToken(b).length - mentionToken(a).length)) {
    const token = mentionToken(m);
    const trailing = text.slice(caret - token.length - 1, caret) === `${token} ` ? 1 : 0;
    const start = caret - token.length - trailing;
    if (start >= 0 && text.slice(start, start + token.length) === token) return { start, end: caret };
  }
  return null;
}
