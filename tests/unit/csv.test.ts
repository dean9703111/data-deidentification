import { describe, it, expect } from 'vitest';
import { serializeMapping, parseMapping, parseCsvRows } from '../../src/core/csv';
import type { MappingEntry } from '../../src/core/types';

const BOM = '﻿';

describe('serializeMapping', () => {
  it('starts with a BOM, has the correct header, and uses CRLF line endings', () => {
    const csv = serializeMapping([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
    expect(csv.startsWith(BOM)).toBe(true);
    const withoutBom = csv.slice(1);
    const lines = withoutBom.split('\r\n');
    expect(lines[0]).toBe('code,category,original');
    expect(lines[1]).toBe('a3f9c2,姓名,王小明');
    expect(withoutBom).not.toContain('\n\n'); // sanity: no bare LF doubling
    expect(withoutBom.includes('\r\n')).toBe(true);
  });

  it('quotes fields containing a comma, doubling is not needed for commas', () => {
    const csv = serializeMapping([{ code: 'abcdef', category: '地址', original: '台北市, 信義區' }]);
    expect(csv).toContain('"台北市, 信義區"');
  });

  it('quotes fields containing a double quote, doubling the quote', () => {
    const csv = serializeMapping([{ code: 'abcdef', category: '姓名', original: '王"小"明' }]);
    expect(csv).toContain('"王""小""明"');
  });

  it('quotes fields containing a newline', () => {
    const csv = serializeMapping([{ code: 'abcdef', category: '備註', original: '第一行\n第二行' }]);
    expect(csv).toContain('"第一行\n第二行"');
  });

  it('does not quote plain fields', () => {
    const csv = serializeMapping([{ code: 'abcdef', category: '手機', original: '0912345678' }]);
    expect(csv).toContain('abcdef,手機,0912345678');
    expect(csv).not.toContain('"abcdef"');
  });
});

describe('round-trip: parseMapping(serializeMapping(entries))', () => {
  it('deep-equals the original entries, including special characters', () => {
    const entries: MappingEntry[] = [
      { code: 'a3f9c2', category: '姓名', original: '王小明' },
      { code: '0f1e2d', category: '地址', original: '台北市, 信義區"市府路"45號\n8樓' },
      { code: '112233', category: '電子郵件', original: 'a.b+c@example.com' },
      { code: '445566', category: '備註', original: '多行\n內容\n測試' },
    ];
    const csv = serializeMapping(entries);
    const result = parseMapping(csv);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual(entries);
  });
});

describe('parseMapping', () => {
  it('accepts LF line endings', () => {
    const text = 'code,category,original\na3f9c2,姓名,王小明\n';
    const result = parseMapping(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
  });

  it('accepts CRLF line endings', () => {
    const text = 'code,category,original\r\na3f9c2,姓名,王小明\r\n';
    const result = parseMapping(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
  });

  it('accepts input without a BOM', () => {
    const text = 'code,category,original\na3f9c2,姓名,王小明\n';
    expect(text.startsWith(BOM)).toBe(false);
    const result = parseMapping(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it('reports errors and returns no entries when a required header is missing', () => {
    const text = 'code,original\na3f9c2,王小明\n';
    const result = parseMapping(text);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.entries).toEqual([]);
  });

  it('reports a duplicate code error and skips the duplicate row', () => {
    const text =
      'code,category,original\n' +
      'a3f9c2,姓名,王小明\n' +
      'a3f9c2,姓名,林美玲\n';
    const result = parseMapping(text);
    expect(result.entries).toEqual([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
    expect(result.errors.some((e) => e.includes('a3f9c2'))).toBe(true);
  });

  it('reports an error for an empty code row', () => {
    const text = 'code,category,original\n,姓名,王小明\n';
    const result = parseMapping(text);
    expect(result.entries).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('tolerates an extra unknown trailing column', () => {
    const text = 'code,category,original,extra\na3f9c2,姓名,王小明,noise\n';
    const result = parseMapping(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
  });

  it('matches columns by header name, not position', () => {
    const text = 'original,code,category\n王小明,a3f9c2,姓名\n';
    const result = parseMapping(text);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([{ code: 'a3f9c2', category: '姓名', original: '王小明' }]);
  });
});

describe('parseCsvRows', () => {
  it('handles a quoted field with an embedded newline', () => {
    const text = 'a,"b\nc",d\n';
    const rows = parseCsvRows(text);
    expect(rows).toEqual([['a', 'b\nc', 'd']]);
  });

  it('handles escaped (doubled) quotes inside a quoted field', () => {
    const text = 'a,"he said ""hi""",c\n';
    const rows = parseCsvRows(text);
    expect(rows).toEqual([['a', 'he said "hi"', 'c']]);
  });
});
