import { describe, expect, it } from 'vitest';
import { checkRetention, describeRetention, firstExample, modesFor, sanitizeRetention, splitFor } from '../../src/core/retention';
import { CodeBook } from '../../src/core/codes';
import { addManualItem, detect, resplitItems } from '../../src/core/detector';
import { applyRedactions, mergeMappings, outputFor, previewLabel } from '../../src/core/redactor';
import { parseMapping, serializeMapping } from '../../src/core/csv';
import { restore } from '../../src/core/restorer';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { SUGGESTED_RETENTION } from '../helpers/retention-fixtures';
import type { Pattern, RedactionItem } from '../../src/core/types';

const SUGGESTED: Pattern[] = BUILTIN_PATTERNS.map((p) => ({ ...p, retention: SUGGESTED_RETENTION[p.id] }));

describe('splitFor', () => {
  it('keeps leading / trailing characters', () => {
    expect(splitFor('A123456789', { mode: 'ends', head: 2, tail: 0 })).toEqual({ head: 2, tail: 0 });
    expect(splitFor('0912-345-678', { mode: 'ends', head: 0, tail: 3 })).toEqual({ head: 0, tail: 3 });
  });

  it('hides everything when nothing would stay hidden', () => {
    expect(splitFor('AB12', { mode: 'ends', head: 2, tail: 2 })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('abc', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('@x', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('王', { mode: 'surname' })).toEqual({ head: 0, tail: 0 });
  });

  it('uses the first delimiter for "after" and the last for "before"', () => {
    expect(splitFor('a@b@c.com', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 8 });
    expect(splitFor('a@b@c.com', { mode: 'delim', delimiter: '@', side: 'before' })).toEqual({ head: 4, tail: 0 });
  });

  it('keeps compound surnames whole', () => {
    expect(splitFor('王小明', { mode: 'surname' })).toEqual({ head: 1, tail: 0 });
    expect(splitFor('歐陽志明', { mode: 'surname' })).toEqual({ head: 2, tail: 0 });
  });

  it('keeps an address up to the city or district', () => {
    expect(splitFor('高雄市苓雅區四維三路2號', { mode: 'city' })).toEqual({ head: 3, tail: 0 });
    expect(splitFor('新北市板橋區中山路一段161號', { mode: 'district' })).toEqual({ head: 6, tail: 0 });
    expect(splitFor('臺北市信義區市府路45號8樓', { mode: 'district' })).toEqual({ head: 6, tail: 0 });
    // no district: falls back to the city; no city: hide everything
    expect(splitFor('台北市市府路45號', { mode: 'district' })).toEqual({ head: 3, tail: 0 });
    expect(splitFor('信義區市府路45號', { mode: 'district' })).toEqual({ head: 0, tail: 0 });
  });
});

describe('checkRetention', () => {
  it('rejects settings that keep the whole example', () => {
    expect(checkRetention('A123456789', { mode: 'ends', head: 10, tail: 0 }).error).toMatch(/至少要隱藏/);
    expect(checkRetention('x', { mode: 'delim', delimiter: '', side: 'after' }).error).toMatch(/分隔字元/);
  });

  it('warns when less than half is hidden or both ends are kept', () => {
    expect(checkRetention('A123456789', { mode: 'ends', head: 2, tail: 0 })).toEqual({ error: null, warnings: [] });
    expect(checkRetention('A123456789', { mode: 'ends', head: 6, tail: 0 }).warnings[0]).toMatch(/不到一半/);
    expect(checkRetention('A123456789', { mode: 'ends', head: 2, tail: 2 }).warnings[0]).toMatch(/前後同時保留/);
  });

  it('warns when the example lacks the delimiter; semantic modes are exempt', () => {
    expect(checkRetention('EMP-001', { mode: 'delim', delimiter: '@', side: 'after' }).warnings[0]).toMatch(/全部隱藏/);
    expect(checkRetention('歐陽志明', { mode: 'surname' })).toEqual({ error: null, warnings: [] });
  });
});

describe('helpers', () => {
  it('describes, lists modes, reads examples, sanitizes', () => {
    expect(describeRetention({ mode: 'ends', head: 6, tail: 4 })).toBe('保留前 6 碼＋後 4 碼');
    expect(describeRetention({ mode: 'delim', delimiter: '@', side: 'after' })).toBe('保留「@」之後');
    expect(modesFor('地址')).toContain('district');
    expect(modesFor('身分證')).not.toContain('surname');
    expect(firstExample('王小明、歐陽志遠')).toBe('王小明');
    expect(sanitizeRetention({ mode: 'ends', head: -1, tail: 0 })).toBeNull();
    expect(sanitizeRetention({ mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ mode: 'delim', delimiter: '@', side: 'after' });
  });
});

describe('partial output', () => {
  const text = '王小明 A123456789，M123456789，手機 0912-345-678，amy.chen@gmail.com，住 台北市信義區市府路45號8樓；王小明再次出現';

  it('keeps characters outside the marker and records only the hidden part', () => {
    const items = detect(text, SUGGESTED);
    const byOriginal = (o: string) => items.find((i) => i.original === o)!;
    expect(outputFor(byOriginal('A123456789'))).toMatch(/^A1\[身分證:[0-9a-f]{6}\]$/);
    expect(outputFor(byOriginal('0912-345-678'))).toMatch(/^\[手機:[0-9a-f]{6}\]678$/);
    expect(outputFor(byOriginal('amy.chen@gmail.com'))).toMatch(/^\[電子郵件:[0-9a-f]{6}\]@gmail\.com$/);
    expect(outputFor(byOriginal('台北市信義區市府路45號8樓'))).toMatch(/^台北市信義區\[地址:[0-9a-f]{6}\]$/);
    expect(previewLabel(byOriginal('A123456789'))).toBe('A1[身分證]');
    expect(previewLabel(byOriginal('王小明'))).toBe('王[姓名]');

    const { mapping, redactedText } = applyRedactions(text, items);
    expect(mapping.find((m) => m.category === '身分證' && m.prefix === 'A1')?.original).toBe('23456789');
    // same hidden part, different full value → different codes
    expect(byOriginal('A123456789').code).not.toBe(byOriginal('M123456789').code);
    // same full value → one code
    const wang = items.filter((i) => i.original === '王小明');
    expect(wang[0].code).toBe(wang[1].code);

    const csv = serializeMapping(mapping);
    expect(csv.split('\r\n')[0]).toBe('﻿code,category,original,kept_prefix,kept_suffix');
    const parsed = parseMapping(csv);
    expect(parsed.errors).toEqual([]);
    expect(restore(redactedText, parsed.entries).restoredText).toBe(text);
  });

  it('writes the v1 CSV header when nothing is kept', () => {
    const { mapping } = applyRedactions(text, detect(text, BUILTIN_PATTERNS));
    expect(serializeMapping(mapping).split('\r\n')[0]).toBe('﻿code,category,original');
  });

  it('gives a manual item with a different retention its own code, so restore stays exact', () => {
    const t = 'A123456789 與 A123456789';
    const book = new CodeBook();
    const items: RedactionItem[] = detect(t, SUGGESTED, book).filter((i) => i.start === 0);
    const manual = addManualItem(items, t, 13, 23, '身分證', book, { mode: 'none' });
    expect(manual.code).not.toBe(items[0].code);
    const { redactedText, mapping } = applyRedactions(t, items);
    expect(redactedText).toMatch(/^A1\[身分證:\w{6}\] 與 \[身分證:\w{6}\]$/);
    expect(restore(redactedText, mapping).restoredText).toBe(t);
  });
});

describe('shared and imported codes', () => {
  it('shares one book across documents', () => {
    const book = new CodeBook();
    const a = detect('王小明來電', BUILTIN_PATTERNS, book);
    const b = detect('聯絡人 王小明 表示', BUILTIN_PATTERNS, book);
    expect(a[0].code).toBe(b.find((i) => i.original === '王小明')!.code);
  });

  it('reuses codes from an imported table by full value and never collides with them', () => {
    const first = detect('A123456789、王小明來電', SUGGESTED);
    const table = parseMapping(serializeMapping(applyRedactions('A123456789、王小明來電', first).mapping)).entries;

    const book = new CodeBook();
    expect(book.seed(table)).toEqual([]);
    const next = detect('M123456789、A123456789、王小明來電', SUGGESTED, book);
    const a = next.find((i) => i.original === 'A123456789')!;
    const b = next.find((i) => i.original === 'M123456789')!;
    expect(a.code).toBe(first.find((i) => i.original === 'A123456789')!.code);
    expect(table.some((e) => e.code === b.code)).toBe(false);

    const merged = mergeMappings(table, applyRedactions('M123456789、A123456789、王小明來電', next).mapping);
    expect(merged.length).toBe(table.length + 1);
  });

  it('reads a v1 table (no kept columns) as full values and warns on duplicate values', () => {
    const book = new CodeBook();
    const warnings = book.seed([
      { code: 'aaaaaa', category: '姓名', original: '王小明' },
      { code: 'bbbbbb', category: '姓名', original: '王小明' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(book.codeFor('姓名', '王小明')).toBe('aaaaaa');
  });
});

describe('preview-style output (部分保留)', () => {
  const cases: [string, string, RegExp][] = [
    ['姓名', '王小明', /^王\[姓名:\w{6}\]$/],
    ['身分證', 'A123456789', /^A12\[身分證:\w{6}\]9$/],
    ['手機', '0912-345-678', /^0912-\[手機:\w{6}\]-678$/],
    ['市話', '(02)2712-3456', /^\(02\)\[市話:\w{6}\]56$/],
    ['地址', '台北市信義區市府路45號8樓', /^台北市信義區\[地址:\w{6}\]$/],
    ['電子郵件', 'amy.chen@gmail.com', /^am\[電子郵件:\w{6}\]@gmail\.com$/],
    ['公司', '築夢實業股份有限公司', /^築夢\[公司:\w{6}\]股份有限公司$/],
    ['統編', '04595257', /^04\[統編:\w{6}\]7$/],
  ];
  it.each(cases)('%s %s keeps what the preview mask shows', (category, value, expected) => {
    const items: RedactionItem[] = [];
    const it = addManualItem(items, value, 0, value.length, category as never, new CodeBook(), { mode: 'preview' });
    expect(outputFor(it)).toMatch(expected);
  });
});

describe('resplitItems', () => {
  it('switches between 全部隱藏 and 部分保留 and restores exactly either way', () => {
    const text = '王小明 A123456789 0912-345-678';
    const book = new CodeBook();
    const items = detect(text, BUILTIN_PATTERNS, book);
    resplitItems(items, book, () => ({ mode: 'preview' }));
    const preview = applyRedactions(text, items);
    expect(preview.redactedText).toMatch(/^王\[姓名:\w{6}\] A12\[身分證:\w{6}\]9 0912-\[手機:\w{6}\]-678$/);
    expect(restore(preview.redactedText, preview.mapping).restoredText).toBe(text);

    resplitItems(items, book, () => undefined);
    const code = applyRedactions(text, items);
    expect(code.redactedText).toMatch(/^\[姓名:\w{6}\] \[身分證:\w{6}\] \[手機:\w{6}\]$/);
    expect(items.every((i) => !i.head && !i.tail)).toBe(true);
    expect(restore(code.redactedText, code.mapping).restoredText).toBe(text);
  });
});

describe('setCategoryRetention (設為預設)', () => {
  it('writes one retention to every rule of the category and clears it with 全部隱藏', async () => {
    const { setCategoryRetention, getEffectivePatterns } = await import('../../src/core/pattern-store');
    const base = { version: 1 as const, disabledBuiltins: [], customPatterns: [{ id: 'c-1', name: '員編', category: '身分證' as const, regex: 'EMP\\d+', example: 'EMP1', enabled: true }] };
    const set = setCategoryRetention(base, '身分證', { mode: 'ends', head: 2, tail: 0 });
    const ids = getEffectivePatterns(set).filter((p) => p.category === '身分證').map((p) => p.retention);
    expect(ids).toEqual([{ mode: 'ends', head: 2, tail: 0 }, { mode: 'ends', head: 2, tail: 0 }]);
    expect(getEffectivePatterns(set).find((p) => p.category === '姓名')!.retention).toBeUndefined();
    const cleared = setCategoryRetention(set, '身分證', { mode: 'none' });
    expect(cleared.retention).toEqual({});
  });
});
