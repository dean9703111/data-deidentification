import type { MappingEntry, RedactionItem, TextEdit } from './types';
import { buildMarker } from './codes';

export interface RedactionResult {
  redactedText: string;
  edits: TextEdit[];
  mapping: MappingEntry[];
}

/** Kept prefix, hidden part and kept suffix of an item's original value. */
export function splitItem(it: RedactionItem): { prefix: string; hidden: string; suffix: string } {
  const head = it.head ?? 0;
  const tail = it.tail ?? 0;
  const o = it.original;
  return { prefix: o.slice(0, head), hidden: o.slice(head, o.length - tail), suffix: o.slice(o.length - tail) };
}

/** What the item becomes in the output file: kept prefix + marker + kept suffix. */
export function outputFor(it: RedactionItem): string {
  const { prefix, suffix } = splitItem(it);
  return prefix + buildMarker(it.category, it.code) + suffix;
}

export function isPartial(it: RedactionItem): boolean {
  return Boolean(it.head || it.tail);
}

export function buildEdits(items: RedactionItem[]): TextEdit[] {
  return items
    .filter((it) => it.active)
    .sort((a, b) => a.start - b.start)
    .map((it) => ({ start: it.start, end: it.end, replacement: outputFor(it) }));
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const e of sorted) {
    if (e.start < cursor) throw new Error('編輯範圍重疊');
    out += text.slice(cursor, e.start) + e.replacement;
    cursor = e.end;
  }
  return out + text.slice(cursor);
}

export function applyRedactions(text: string, items: RedactionItem[]): RedactionResult {
  const edits = buildEdits(items);
  // One row per code, ordered by first occurrence: repeated values share a code (see CodeBook).
  const mapping: MappingEntry[] = [];
  const seen = new Set<string>();
  for (const it of [...items].filter((it) => it.active).sort((a, b) => a.start - b.start)) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    const { prefix, hidden, suffix } = splitItem(it);
    const entry: MappingEntry = { code: it.code, category: it.category, original: hidden };
    if (prefix) entry.prefix = prefix;
    if (suffix) entry.suffix = suffix;
    mapping.push(entry);
  }
  return { redactedText: applyEdits(text, edits), edits, mapping };
}

/** One row per code across an imported table and several documents, imported rows first. */
export function mergeMappings(...lists: MappingEntry[][]): MappingEntry[] {
  const seen = new Set<string>();
  const out: MappingEntry[] = [];
  for (const list of lists) {
    for (const e of list) {
      if (seen.has(e.code)) continue;
      seen.add(e.code);
      out.push(e);
    }
  }
  return out;
}
