import { describe, expect, it } from 'vitest';
import { detect, addManualItem, toggleItem, OverlapError } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import type { Category, Pattern, RedactionItem } from '../../src/core/types';

/** Build a minimal custom Pattern for deterministic tests. */
function mkPattern(opts: {
  id: string;
  regex: string;
  category?: Category;
  enabled?: boolean;
  validate?: (m: string) => boolean;
}): Pattern {
  return {
    id: opts.id,
    name: opts.id,
    category: opts.category ?? '識別碼',
    source: 'custom',
    regex: opts.regex,
    example: 'x',
    enabled: opts.enabled ?? true,
    validate: opts.validate,
  };
}

/** Assert that no two items in the list overlap in [start, end). */
function assertNoOverlaps(items: RedactionItem[]) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const overlap = a.start < b.end && b.start < a.end;
      expect(overlap).toBe(false);
    }
  }
}

describe('detect', () => {
  it('longer match wins when one pattern fully contains another', () => {
    const text = 'xxABCDEFxx';
    const patterns = [
      mkPattern({ id: 'short', regex: 'ABC' }),
      mkPattern({ id: 'long', regex: 'ABCDEF' }),
    ];
    const items = detect(text, patterns);
    expect(items).toHaveLength(1);
    expect(items[0].original).toBe('ABCDEF');
    expect(items[0].start).toBe(2);
    expect(items[0].end).toBe(8);
    assertNoOverlaps(items);
  });

  it('equal-length overlapping matches: earlier start wins, and results never overlap', () => {
    const text = 'ABCXYZ';
    const patterns = [
      mkPattern({ id: 'first', regex: 'ABCXY' }), // 0-5
      mkPattern({ id: 'second', regex: 'BCXYZ' }), // 1-6, same length
    ];
    const items = detect(text, patterns);
    expect(items).toHaveLength(1);
    expect(items[0].start).toBe(0);
    expect(items[0].end).toBe(5);
    expect(items[0].original).toBe('ABCXY');
    assertNoOverlaps(items);
  });

  it('disabled pattern yields no items', () => {
    const text = 'ABCDEF';
    const patterns = [mkPattern({ id: 'off', regex: 'ABC', enabled: false })];
    const items = detect(text, patterns);
    expect(items).toEqual([]);
  });

  it('results are sorted by start ascending', () => {
    const text = 'ZZZ111YYY222XXX333';
    const patterns = [
      mkPattern({ id: 'digits', regex: '\\d{3}' }),
    ];
    const items = detect(text, patterns);
    const starts = items.map((i) => i.start);
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
    expect(items.length).toBeGreaterThan(1);
  });

  it('all codes are unique 6-hex-char strings', () => {
    const text = 'AAA BBB CCC DDD';
    const patterns = [mkPattern({ id: 'word', regex: '[A-Z]{3}' })];
    const items = detect(text, patterns);
    expect(items.length).toBe(4);
    const codes = items.map((i) => i.code);
    for (const c of codes) expect(c).toMatch(/^[0-9a-f]{6}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('respects a pre-filled `used` set: new codes are not in it and get added to it', () => {
    const text = 'AAA BBB CCC';
    const patterns = [mkPattern({ id: 'word', regex: '[A-Z]{3}' })];
    const used = new Set<string>(['aaaaaa', 'bbbbbb']);
    const originalSize = used.size;
    const items = detect(text, patterns, used);
    expect(items.length).toBe(3);
    for (const it of items) {
      expect(used.has('aaaaaa') && it.code === 'aaaaaa').toBe(false);
      expect(it.code).not.toBe('aaaaaa');
      expect(it.code).not.toBe('bbbbbb');
      expect(used.has(it.code)).toBe(true);
    }
    expect(used.size).toBe(originalSize + items.length);
  });

  it('validate function filters out non-matching candidates', () => {
    const text = 'ABCABC';
    const patterns = [mkPattern({ id: 'rejectAll', regex: 'ABC', validate: () => false })];
    const items = detect(text, patterns);
    expect(items).toEqual([]);
  });

  it('items carry origin auto, active true, and original === text.slice(start,end)', () => {
    const text = 'xxHELLOxx';
    const patterns = [mkPattern({ id: 'hello', regex: 'HELLO', category: '姓名' })];
    const items = detect(text, patterns);
    expect(items).toHaveLength(1);
    const it = items[0];
    expect(it.origin).toBe('auto');
    expect(it.active).toBe(true);
    expect(it.original).toBe(text.slice(it.start, it.end));
    expect(it.category).toBe('姓名');
  });

  it('a zero-length-match regex does not infinite-loop and yields no items', () => {
    const text = 'bbb';
    const patterns = [mkPattern({ id: 'zero', regex: 'a*' })];
    const items = detect(text, patterns);
    expect(items).toEqual([]);
  });
});

describe('addManualItem', () => {
  it('adds an item with origin manual, unique code, active true, mutates array in place, stays sorted', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    const returned = addManualItem(items, text, 5, 8, '手機', used);

    expect(returned.origin).toBe('manual');
    expect(returned.active).toBe(true);
    expect(returned.category).toBe('手機');
    expect(returned.original).toBe('567');
    expect(returned.code).toMatch(/^[0-9a-f]{6}$/);
    expect(used.has(returned.code)).toBe(true);

    // same array instance mutated in place
    expect(items).toHaveLength(1);
    expect(items[0]).toBe(returned);

    // add an earlier item and confirm sort order by start is maintained
    const second = addManualItem(items, text, 0, 2, '姓名', used);
    expect(items).toHaveLength(2);
    expect(items[0]).toBe(second);
    expect(items[1]).toBe(returned);
    expect(items.map((i) => i.start)).toEqual([0, 5]);
  });

  it('throws OverlapError when overlapping an existing active item', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    addManualItem(items, text, 2, 6, '手機', used);
    expect(() => addManualItem(items, text, 4, 8, '姓名', used)).toThrow(OverlapError);
  });

  it('allows overlap with an inactive (cancelled) item', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    const first = addManualItem(items, text, 2, 6, '手機', used);
    toggleItem(items, first.id); // deactivate
    expect(() => addManualItem(items, text, 4, 8, '姓名', used)).not.toThrow();
    expect(items).toHaveLength(2);
  });

  it('throws on invalid range: start >= end', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    expect(() => addManualItem(items, text, 5, 5, '姓名', used)).toThrow();
    expect(() => addManualItem(items, text, 6, 5, '姓名', used)).toThrow();
  });

  it('throws on invalid range: end beyond text length', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    expect(() => addManualItem(items, text, 5, text.length + 1, '姓名', used)).toThrow();
  });

  it('throws on invalid range: negative start', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    expect(() => addManualItem(items, text, -1, 3, '姓名', used)).toThrow();
  });
});

describe('toggleItem', () => {
  it('flips active and returns the item; unknown id returns undefined', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    const item = addManualItem(items, text, 0, 3, '姓名', used);
    expect(item.active).toBe(true);

    const toggled = toggleItem(items, item.id);
    expect(toggled).toBe(item);
    expect(item.active).toBe(false);

    const toggledBack = toggleItem(items, item.id);
    expect(toggledBack!.active).toBe(true);

    expect(toggleItem(items, 'does-not-exist')).toBeUndefined();
  });

  it('throws OverlapError when re-activating an item that would now overlap an active one', () => {
    const text = '0123456789';
    const items: RedactionItem[] = [];
    const used = new Set<string>();
    const itemA = addManualItem(items, text, 0, 5, '姓名', used);
    toggleItem(items, itemA.id); // deactivate A
    const itemB = addManualItem(items, text, 2, 7, '手機', used); // overlaps A's range, allowed since A inactive

    expect(() => toggleItem(items, itemA.id)).toThrow(OverlapError);
    // A should remain inactive since the toggle threw before mutating (per current impl the check
    // happens before flipping active, so state is unchanged)
    expect(itemA.active).toBe(false);
    expect(itemB.active).toBe(true);
  });
});

describe('integration with applyRedactions', () => {
  it('replaces active items with markers, excludes inactive items from mapping, and keeps mapping ordered by start', () => {
    const text = '甲乙丙丁A123456789戊己庚辛someone@example.com';
    const items: RedactionItem[] = [];
    const used = new Set<string>();

    const idItem = addManualItem(items, text, 4, 14, '身分證', used); // A123456789
    const emailStart = text.indexOf('someone@example.com');
    const emailItem = addManualItem(
      items,
      text,
      emailStart,
      emailStart + 'someone@example.com'.length,
      '電子郵件',
      used,
    );

    // toggle the id item off
    toggleItem(items, idItem.id);

    const result = applyRedactions(text, items);

    // redactedText still contains the original text of the toggled-off item
    expect(result.redactedText).toContain('A123456789');
    // and does not contain the raw email anymore, replaced by a marker instead
    expect(result.redactedText).not.toContain('someone@example.com');
    expect(result.redactedText).toContain(`[電子郵件:${emailItem.code}]`);

    // mapping excludes the inactive item's code
    const mappingCodes = result.mapping.map((m) => m.code);
    expect(mappingCodes).not.toContain(idItem.code);
    expect(mappingCodes).toContain(emailItem.code);

    // mapping order follows start offset
    const starts = items.filter((i) => i.active).map((i) => i.start);
    expect(mappingCodes.length).toBe(starts.length);
    // re-derive expected order by re-sorting active items by start
    const expectedOrder = [...items]
      .filter((i) => i.active)
      .sort((a, b) => a.start - b.start)
      .map((i) => i.code);
    expect(mappingCodes).toEqual(expectedOrder);
  });
});
