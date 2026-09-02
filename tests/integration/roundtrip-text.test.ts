import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detect } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { serializeMapping, parseMapping } from '../../src/core/csv';
import { parseMarkers } from '../../src/core/codes';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';

const SAMPLE_TXT_PATH = 'tests/fixtures/sample.txt';
const SAMPLE_MD_PATH = 'tests/fixtures/sample.md';

const FIXTURES = [
  { label: 'sample.txt', path: SAMPLE_TXT_PATH },
  { label: 'sample.md', path: SAMPLE_MD_PATH },
];

describe.each(FIXTURES)('roundtrip for $label', ({ path }) => {
  const original = readFileSync(path, 'utf-8');

  it('detects at least one item', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    expect(items.length).toBeGreaterThan(0);
  });

  // KNOWN SRC BUG (see final report): the zh-name NAME_FOLLOW lookahead in
  // src/core/patterns.ts does not include the common continuation word "另", so the
  // third occurrence of 王小明 in sample.txt ("王小明另提供緊急聯絡人...") is never
  // detected. That leaves this original's third occurrence un-redacted, failing this
  // assertion. Left in place per instructions rather than weakened to match the bug.
  it('removes every active original from the redacted text and leaves exactly mapping.length markers', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { redactedText, mapping } = applyRedactions(original, items);

    const uniqueOriginals = new Set(items.filter((i) => i.active).map((i) => i.original));
    for (const orig of uniqueOriginals) {
      expect(redactedText.includes(orig)).toBe(false);
    }

    const markers = parseMarkers(redactedText);
    expect(markers.length).toBe(mapping.length);
  });

  it('generates unique codes (SC-004) with a 1:1 code set between markers and mapping', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { redactedText, mapping } = applyRedactions(original, items);

    const mappingCodes = mapping.map((m) => m.code);
    expect(new Set(mappingCodes).size).toBe(mappingCodes.length);

    const markerCodes = parseMarkers(redactedText).map((m) => m.code);
    expect(new Set(markerCodes)).toEqual(new Set(mappingCodes));
  });

  it('round-trips through CSV serialize/parse/restore back to the original text (SC-003)', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { redactedText, mapping } = applyRedactions(original, items);

    const csv = serializeMapping(mapping);
    const { entries, errors } = parseMapping(csv);
    expect(errors).toEqual([]);

    const result = restore(redactedText, entries);
    expect(result.restoredText).toBe(original);
    expect(result.missingCodes).toEqual([]);
    expect(result.restoredCount).toBe(mapping.length);
  });
});

describe('sample.txt specifics', () => {
  const original = readFileSync(SAMPLE_TXT_PATH, 'utf-8');

  // KNOWN SRC BUG (see final report): only 2 of the 3 raw occurrences of 王小明 are
  // detected because "王小明另提供..." is missed by the zh-name NAME_FOLLOW heuristic.
  it('gives repeated occurrences of 王小明 distinct codes (FR-018)', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { mapping } = applyRedactions(original, items);

    const wangEntries = mapping.filter((m) => m.original === '王小明');
    expect(wangEntries.length).toBe(3);
    const codes = new Set(wangEntries.map((e) => e.code));
    expect(codes.size).toBe(3);
  });

  it('covers every expected category', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { mapping } = applyRedactions(original, items);
    const categories = new Set(mapping.map((m) => m.category));
    for (const cat of ['姓名', '身分證', '手機', '市話', '地址', '電子郵件']) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it('finds the expected specific originals', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { mapping } = applyRedactions(original, items);
    const originals = mapping.map((m) => m.original);

    const expected = [
      'A123456789',
      'B223456782',
      '0912-345-678',
      '(02)2712-3456',
      'xiaoming.wang@example.com',
      '台北市信義區市府路45號8樓',
      '王小明',
      '林美玲',
      '歐陽志遠',
      '陳大文',
    ];
    for (const value of expected) {
      expect(originals).toContain(value);
    }
  });

  it('does not treat custom-only or non-name text as builtin matches', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    const { mapping } = applyRedactions(original, items);
    const originals = mapping.map((m) => m.original);

    for (const value of ['高雄市政府', '方法論', '任何人', 'EMP-004521']) {
      expect(originals).not.toContain(value);
    }
  });

  it('leaves a cancelled items original in place and excludes its code from the mapping, while still round-tripping', () => {
    const items = detect(original, BUILTIN_PATTERNS);
    expect(items.length).toBeGreaterThan(0);
    items[0].active = false;

    const { redactedText, mapping } = applyRedactions(original, items);
    expect(redactedText.includes(items[0].original)).toBe(true);
    expect(mapping.some((m) => m.code === items[0].code)).toBe(false);

    const csv = serializeMapping(mapping);
    const { entries, errors } = parseMapping(csv);
    expect(errors).toEqual([]);

    // The cancelled item's text was never turned into a marker, so restoring every
    // other marker back to its original value reproduces the source text exactly.
    const result = restore(redactedText, entries);
    expect(result.restoredText).toBe(original);
    expect(result.missingCodes).toEqual([]);
  });
});
