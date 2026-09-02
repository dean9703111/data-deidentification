import type { MappingEntry } from './types';

const BOM = '\uFEFF';
const REQUIRED_HEADERS = ['code', 'category', 'original'] as const;

function quote(field: string): string {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

export function serializeMapping(entries: MappingEntry[]): string {
  const lines = [REQUIRED_HEADERS.join(',')];
  for (const e of entries) {
    lines.push([e.code, e.category, e.original].map(quote).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/** RFC 4180 tokenizer: returns rows of fields. Handles quoted fields with embedded newlines. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  if (text.startsWith(BOM)) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface ParseMappingResult {
  entries: MappingEntry[];
  errors: string[];
}

export function parseMapping(text: string): ParseMappingResult {
  const errors: string[] = [];
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { entries: [], errors: ['CSV 為空'] };

  const header = rows[0].map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h] = i));
  for (const h of REQUIRED_HEADERS) {
    if (!(h in idx)) errors.push(`缺少必要欄位：${h}`);
  }
  if (errors.length) return { entries: [], errors };

  const entries: MappingEntry[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, n) => {
    const code = (r[idx.code] ?? '').trim();
    const category = r[idx.category] ?? '';
    const original = r[idx.original] ?? '';
    const lineNo = n + 2;
    if (!code) {
      errors.push(`第 ${lineNo} 列：code 為空`);
      return;
    }
    if (seen.has(code)) {
      errors.push(`第 ${lineNo} 列：編碼 ${code} 重複`);
      return;
    }
    seen.add(code);
    entries.push({ code, category, original });
  });
  return { entries, errors };
}
