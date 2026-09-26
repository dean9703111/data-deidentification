import type { Category, Pattern, RedactionItem, Retention } from './types';
import { CodeBook } from './codes';
import { splitFor } from './retention';

let nextId = 1;
function newId(): string {
  return `r${nextId++}`;
}

interface Candidate {
  category: Category;
  start: number;
  end: number;
  retention?: Retention;
}

function makeItem(text: string, start: number, end: number, category: Category, book: CodeBook, origin: 'auto' | 'manual', retention?: Retention): RedactionItem {
  const original = text.slice(start, end);
  const item: RedactionItem = { id: newId(), category, original, start, end, code: '', origin, active: true };
  if (retention) item.retention = retention;
  applySplit(item, retention, book);
  return item;
}

function applySplit(item: RedactionItem, retention: Retention | undefined, book: CodeBook): void {
  const { head, tail } = splitFor(item.original, retention, item.category);
  if (head) item.head = head;
  else delete item.head;
  if (tail) item.tail = tail;
  else delete item.tail;
  item.code = book.codeFor(item.category, item.original, head, tail);
}

/**
 * Re-splits every item for a new output mode (全部隱藏／部分保留／自訂). Codes follow the split, so an
 * item whose kept characters change gets the code for its new split (see CodeBook).
 */
export function resplitItems(items: RedactionItem[], book: CodeBook, resolve: (it: RedactionItem) => Retention | undefined): void {
  for (const it of items) applySplit(it, resolve(it), book);
}

export function compilePattern(p: Pattern): RegExp | null {
  try {
    return new RegExp(p.regex, 'gu');
  } catch {
    return null;
  }
}

/** Longest match wins; on equal length, the earlier start wins. */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen: Candidate[] = [];
  for (const c of sorted) {
    if (chosen.every((k) => c.end <= k.start || c.start >= k.end)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

export function detect(text: string, patterns: Pattern[], book: CodeBook = new CodeBook()): RedactionItem[] {
  const cands: Candidate[] = [];
  for (const p of patterns) {
    if (!p.enabled) continue;
    const re = compilePattern(p);
    if (!re) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (p.validate && !p.validate(m[0], text.slice(Math.max(0, m.index - 3), m.index))) continue;
      cands.push({ category: p.category, start: m.index, end: m.index + m[0].length, retention: p.retention });
    }
  }
  return resolveOverlaps(cands).map((c) => makeItem(text, c.start, c.end, c.category, book, 'auto', c.retention));
}

export class OverlapError extends Error {
  constructor() {
    super('選取範圍與既有項目重疊，請調整選取範圍');
  }
}

export function addManualItem(
  items: RedactionItem[],
  text: string,
  start: number,
  end: number,
  category: Category,
  book: CodeBook,
  retention?: Retention,
): RedactionItem {
  if (start < 0 || end > text.length || start >= end) throw new Error('選取範圍無效');
  const overlaps = items.some((it) => it.active && start < it.end && end > it.start);
  if (overlaps) throw new OverlapError();
  const item = makeItem(text, start, end, category, book, 'manual', retention);
  const next = [...items, item].sort((a, b) => a.start - b.start);
  items.length = 0;
  items.push(...next);
  return item;
}

export function toggleItem(items: RedactionItem[], id: string): RedactionItem | undefined {
  const it = items.find((x) => x.id === id);
  if (!it) return undefined;
  if (!it.active) {
    const overlaps = items.some((o) => o.active && o.id !== id && it.start < o.end && it.end > o.start);
    if (overlaps) throw new OverlapError();
  }
  it.active = !it.active;
  return it;
}
