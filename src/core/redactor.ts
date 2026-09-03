import type { MappingEntry, RedactionItem, TextEdit } from './types';
import { buildMarker } from './codes';

export interface RedactionResult {
  redactedText: string;
  edits: TextEdit[];
  mapping: MappingEntry[];
}

export function buildEdits(items: RedactionItem[]): TextEdit[] {
  return items
    .filter((it) => it.active)
    .sort((a, b) => a.start - b.start)
    .map((it) => ({ start: it.start, end: it.end, replacement: buildMarker(it.category, it.code) }));
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
    mapping.push({ code: it.code, category: it.category, original: it.original });
  }
  return { redactedText: applyEdits(text, edits), edits, mapping };
}
