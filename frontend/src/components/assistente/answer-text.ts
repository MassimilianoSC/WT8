import { splitCitations } from "@/components/assistente/source-links";

/**
 * The model writes light Markdown (Gemini: "**bold**", "- " / "* " lists,
 * "1." lists, "## " titles). The panel shows it as structure, never as HTML
 * and never as links: blocks of paragraphs and lists, runs of plain or bold
 * text whose parts are strings or [n] references (splitCitations, which also
 * drops the model's links). Anything else stays plain text.
 */

export type Run = { strong: boolean; parts: Array<string | number> };
export type AnswerBlock =
  | { kind: "p"; heading: boolean; runs: Run[] }
  | { kind: "ul" | "ol"; items: Run[][] };

const BOLD = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;

/** Plain and bold runs of one piece of text; an unclosed "**" (still streaming) stays as written. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const push = (s: string, strong: boolean) => {
    if (s) runs.push({ strong, parts: splitCitations(s) });
  };
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    push(text.slice(last, m.index), false);
    push(m[1] ?? m[2], true);
    last = m.index! + m[0].length;
  }
  push(text.slice(last), false);
  return runs;
}

export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "p", heading: false, runs: inlineRuns(paragraph.join("\n")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: list.kind, items: list.items.map(inlineRuns) });
    list = null;
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = bullet || numbered ? null : HEADING.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      flushParagraph();
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "p", heading: true, runs: inlineRuns(heading[1]) });
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
