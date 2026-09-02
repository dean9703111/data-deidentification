import type { MappingEntry, TextEdit } from './types';
import { parseMarkers } from './codes';
import { applyEdits } from './redactor';

export interface RestoreResult {
  restoredText: string;
  edits: TextEdit[];
  missingCodes: string[];
  restoredCount: number;
}

export function restore(text: string, mapping: MappingEntry[]): RestoreResult {
  const table = new Map(mapping.map((m) => [m.code, m.original]));
  const edits: TextEdit[] = [];
  const missing = new Set<string>();
  for (const mk of parseMarkers(text)) {
    const original = table.get(mk.code);
    if (original === undefined) {
      missing.add(mk.code);
      continue;
    }
    edits.push({ start: mk.start, end: mk.end, replacement: original });
  }
  return {
    restoredText: applyEdits(text, edits),
    edits,
    missingCodes: [...missing],
    restoredCount: edits.length,
  };
}
