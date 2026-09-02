import { describe, it, expect } from 'vitest';
import { generateCode, buildMarker, parseMarkers } from '../../src/core/codes';

describe('generateCode', () => {
  it('produces 1000 distinct codes, each matching /^[0-9a-f]{6}$/, all added to used', () => {
    const used = new Set<string>();
    const codes: string[] = [];
    for (let i = 0; i < 1000; i++) {
      codes.push(generateCode(used));
    }
    expect(codes).toHaveLength(1000);
    expect(new Set(codes).size).toBe(1000);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{6}$/);
      expect(used.has(code)).toBe(true);
    }
    expect(used.size).toBe(1000);
  });
});

describe('buildMarker', () => {
  it("builds '[姓名:a3f9c2]' from category and code", () => {
    expect(buildMarker('姓名', 'a3f9c2')).toBe('[姓名:a3f9c2]');
  });
});

describe('parseMarkers', () => {
  it('returns {category, code, start, end} for every marker, in order', () => {
    const text = '個案 [姓名:a3f9c2] 於 [身分證:0f1e2d] 就診。';
    const result = parseMarkers(text);
    expect(result).toHaveLength(2);

    const first = result[0];
    expect(first.category).toBe('姓名');
    expect(first.code).toBe('a3f9c2');
    expect(text.slice(first.start, first.end)).toBe('[姓名:a3f9c2]');

    const second = result[1];
    expect(second.category).toBe('身分證');
    expect(second.code).toBe('0f1e2d');
    expect(text.slice(second.start, second.end)).toBe('[身分證:0f1e2d]');

    expect(second.start).toBeGreaterThan(first.end);
  });

  it('returns [] for plain text with no markers', () => {
    expect(parseMarkers('這是一段沒有標記的純文字。')).toEqual([]);
  });

  it('does not match uppercase hex codes', () => {
    expect(parseMarkers('[姓名:ABCDEF]')).toEqual([]);
  });

  it('does not match a code that is too short', () => {
    expect(parseMarkers('[姓名:abc]')).toEqual([]);
  });

  it('does not match an empty category', () => {
    expect(parseMarkers('[:abcdef]')).toEqual([]);
  });

  it('does not match an unclosed marker', () => {
    expect(parseMarkers('[姓名:abcdef')).toEqual([]);
  });

  it('handles adjacent markers back-to-back', () => {
    const text = '[姓名:abcdef][身分證:123abc]';
    const result = parseMarkers(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ category: '姓名', code: 'abcdef' });
    expect(result[1]).toMatchObject({ category: '身分證', code: '123abc' });
    expect(result[0].end).toBe(result[1].start);
  });

  it('handles nested-looking brackets by not matching the outer pair', () => {
    // The inner "[" breaks the category character class ([^\[\]:]), so only
    // the inner marker (if well-formed) can match.
    const text = '[姓名:[身分證:abcdef]]';
    const result = parseMarkers(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: '身分證', code: 'abcdef' });
  });
});
