import type { TextEdit } from '../core/types';

/** A contiguous run of the document's full text owned by one structural node (docx <w:t>, PDF text item). */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

interface LocalOp {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Distributes full-text edits across segments. An edit that spans several segments puts its
 * replacement in the first segment it touches and deletes the covered text from the others.
 * Returns the new text for every segment that changed.
 */
export function distributeEdits(segments: Segment[], edits: TextEdit[]): Map<number, string> {
  const ops = new Map<number, LocalOp[]>();
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let segIdx = 0;
  for (const e of sorted) {
    while (segIdx < segments.length && segments[segIdx].end <= e.start) segIdx++;
    let first = true;
    for (let i = segIdx; i < segments.length && segments[i].start < e.end; i++) {
      const s = segments[i];
      const localStart = Math.max(e.start, s.start) - s.start;
      const localEnd = Math.min(e.end, s.end) - s.start;
      if (localEnd < localStart) continue;
      if (!ops.has(i)) ops.set(i, []);
      ops.get(i)!.push({ start: localStart, end: localEnd, replacement: first ? e.replacement : '' });
      first = false;
    }
    if (first) throw new Error(`編輯範圍 [${e.start}, ${e.end}) 不對應任何文字節點`);
  }
  const out = new Map<number, string>();
  for (const [i, list] of ops) {
    let text = segments[i].text;
    for (const op of list.sort((a, b) => b.start - a.start)) {
      text = text.slice(0, op.start) + op.replacement + text.slice(op.end);
    }
    out.set(i, text);
  }
  return out;
}
