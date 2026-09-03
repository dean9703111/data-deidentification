import JSZip from 'jszip';
import type { LoadedDocument, RedactionItem } from '../core/types';
import { applyRedactions } from '../core/redactor';
import { serializeMapping } from '../core/csv';
import { generateDocument, mappingFileName, outputFileName } from './index';

export interface BatchEntry {
  doc: LoadedDocument;
  items: RedactionItem[];
}

export interface BatchManifestRow {
  source: string;
  output: string;
  mapping: string;
  count: number;
}

/** Keeps zip entry names unique by appending " (2)", " (3)"… before the extension. */
export function uniqueNamer(): (name: string) => string {
  const taken = new Set<string>();
  return (name) => {
    let n = name;
    let i = 2;
    while (taken.has(n)) {
      const dot = name.lastIndexOf('.');
      n = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
      i++;
    }
    taken.add(n);
    return n;
  };
}

export function manifestCsv(rows: BatchManifestRow[]): string {
  const q = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + ['檔案,去識別化檔,編碼表,生效筆數', ...rows.map((r) => [r.source, r.output, r.mapping, String(r.count)].map(q).join(','))].join('\r\n') + '\r\n';
}

/**
 * One archive holding every de-identified document next to its mapping table, plus 清單.csv
 * that pairs them (needed when two inputs share a base name, e.g. 報價單.pdf and 報價單.docx).
 */
export async function buildArchive(entries: BatchEntry[]): Promise<{ blob: Blob; manifest: BatchManifestRow[] }> {
  const zip = new JSZip();
  const unique = uniqueNamer();
  const manifest: BatchManifestRow[] = [];
  for (const { doc, items } of entries) {
    const { edits, mapping } = applyRedactions(doc.text, items);
    const output = unique(outputFileName(doc.fileName, 'deid'));
    const mappingName = unique(mappingFileName(doc.fileName));
    zip.file(output, await generateDocument(doc, edits));
    zip.file(mappingName, serializeMapping(mapping));
    manifest.push({ source: doc.fileName, output, mapping: mappingName, count: edits.length });
  }
  zip.file('清單.csv', manifestCsv(manifest));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, manifest };
}
