import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detect } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { serializeMapping, parseMapping } from '../../src/core/csv';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';

const SAMPLE_TXT_PATH = 'tests/fixtures/sample.txt';

describe('restore error handling', () => {
  it('reports a missing row as missingCodes, leaves that marker verbatim, and restores every other marker', () => {
    const original = readFileSync(SAMPLE_TXT_PATH, 'utf-8');
    const items = detect(original, BUILTIN_PATTERNS);
    const { redactedText, mapping } = applyRedactions(original, items);
    expect(mapping.length).toBeGreaterThan(1);

    const droppedEntry = mapping[0];
    const remainingEntries = mapping.slice(1);

    const result = restore(redactedText, remainingEntries);

    expect(result.missingCodes).toEqual([droppedEntry.code]);
    expect(result.restoredCount).toBe(mapping.length - 1);

    const marker = `[${droppedEntry.category}:${droppedEntry.code}]`;
    expect(result.restoredText).toContain(marker);

    for (const entry of remainingEntries) {
      expect(result.restoredText).not.toContain(`[${entry.category}:${entry.code}]`);
      expect(result.restoredText).toContain(entry.original);
    }
  });

  it('reports errors for a CSV missing a required header', () => {
    const { entries, errors } = parseMapping('code,original\r\na1b2c3,x');
    expect(errors.length).toBeGreaterThan(0);
    expect(entries).toEqual([]);
  });

  it('reports a duplicate code and keeps only the first row', () => {
    const csv =
      'code,category,original\r\n' + 'a1b2c3,姓名,王小明\r\n' + 'a1b2c3,姓名,林美玲\r\n';
    const { entries, errors } = parseMapping(csv);

    expect(errors.some((e) => e.includes('重複'))).toBe(true);
    expect(entries.length).toBe(1);
    expect(entries[0]).toEqual({ code: 'a1b2c3', category: '姓名', original: '王小明' });
  });

  it('leaves marker-like text unchanged and reports its code as missing when the mapping is empty', () => {
    const text = '請參考 [姓名:abcdef] 條款';
    const result = restore(text, []);

    expect(result.restoredText).toBe(text);
    expect(result.missingCodes).toEqual(['abcdef']);
    expect(result.restoredCount).toBe(0);
  });

  it('restores a marker by code alone, even when the CSV category text differs from the marker category', () => {
    const text = '個案為 [姓名:abcdef]，特此紀錄。';
    const entries = [{ code: 'abcdef', category: '地址', original: '王小明' }];

    const result = restore(text, entries);

    expect(result.restoredText).toBe('個案為 王小明，特此紀錄。');
    expect(result.missingCodes).toEqual([]);
    expect(result.restoredCount).toBe(1);
  });

  it('round trips through serializeMapping/parseMapping before hitting a missing-row scenario', () => {
    const original = readFileSync(SAMPLE_TXT_PATH, 'utf-8');
    const items = detect(original, BUILTIN_PATTERNS);
    const { redactedText, mapping } = applyRedactions(original, items);

    const csv = serializeMapping(mapping);
    const { entries, errors } = parseMapping(csv);
    expect(errors).toEqual([]);

    const droppedCode = entries[0].code;
    const withDrop = entries.slice(1);
    const result = restore(redactedText, withDrop);

    expect(result.missingCodes).toEqual([droppedCode]);
  });
});
