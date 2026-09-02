import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { detect } from '../../src/core/detector';
import type { Pattern } from '../../src/core/types';

function getPattern(id: string): Pattern {
  const p = BUILTIN_PATTERNS.find((p) => p.id === id);
  if (!p) throw new Error(`pattern not found: ${id}`);
  return p;
}

function matches(id: string, text: string): string[] {
  return detect(text, [getPattern(id)]).map((i) => i.original);
}

describe('tw-company pattern', () => {
  it('matches a full 股份有限公司 name', () => {
    expect(matches('tw-company', '築夢實業股份有限公司')).toEqual(['築夢實業股份有限公司']);
  });

  it('matches a clinic name ending in 診所', () => {
    expect(matches('tw-company', '大安聯合診所')).toEqual(['大安聯合診所']);
  });

  it('matches a 有限公司 name', () => {
    expect(matches('tw-company', '永豐企業有限公司')).toEqual(['永豐企業有限公司']);
  });

  it('matches a law-firm name ending in 事務所', () => {
    expect(matches('tw-company', '陳律師事務所')).toEqual(['陳律師事務所']);
  });

  it('matches only the company name in prose, excluding the "甲方：" label', () => {
    expect(matches('tw-company', '甲方：築夢實業股份有限公司（統一編號 04595257）')).toEqual([
      '築夢實業股份有限公司',
    ]);
  });

  it('excludes a leading 由 ("provided by") from the match', () => {
    expect(matches('tw-company', '由嘉宏資訊股份有限公司提供')).toEqual(['嘉宏資訊股份有限公司']);
  });

  it('does not match bare 公司 mentions (not a real suffix on its own)', () => {
    expect(matches('tw-company', '本公司')).toEqual([]);
    expect(matches('tw-company', '公司電話')).toEqual([]);
    expect(matches('tw-company', '該公司')).toEqual([]);
  });

  it('does not match the suffix alone with no name before it', () => {
    expect(matches('tw-company', '有限公司')).toEqual([]);
  });
});

describe('tw-tax-id pattern', () => {
  it('matches a valid tax id after the 統一編號 label', () => {
    expect(matches('tw-tax-id', '統一編號 04595257')).toEqual(['04595257']);
  });

  it('matches a valid tax id after the 統編 label', () => {
    expect(matches('tw-tax-id', '統編：04595257')).toEqual(['04595257']);
  });

  it('does not match an 8-digit number with an invalid checksum', () => {
    expect(matches('tw-tax-id', '12345678')).toEqual([]);
  });

  it('does not match an 8-digit substring embedded in a 9-digit run', () => {
    // '104595257' contains the valid '04595257' as a substring, but it is
    // preceded by an extra digit, so the (?<![\d-]) / (?![\d-]) boundaries
    // must reject it entirely.
    expect(matches('tw-tax-id', '104595257')).toEqual([]);
  });

  it('does not match 8 digits that immediately follow a hyphen (phone-fragment shape)', () => {
    expect(matches('tw-tax-id', '02-27123456')).toEqual([]);
  });
});

describe('overlap between tw-landline and tw-tax-id', () => {
  // KNOWN SRC BUG (src/core/patterns.ts / src/core/detector.ts): the
  // tw-landline regex `\(?0(?:826|836|82|89|37|49|[2-8])\)?[-\x20]?\d{3,4}[-\x20]?\d{3,4}`
  // happens to also match a bare 8-digit tax id whose leading digit is
  // followed by a digit in [2-8] and whose remaining 6 digits split into two
  // groups of 3-4 (e.g. '04595257' parses as area code '04' + '595' + '257').
  // Both tw-landline and tw-tax-id then produce a candidate over the exact
  // same span; detector.ts's resolveOverlaps breaks length ties by array
  // order, and tw-landline is listed before tw-tax-id in BUILTIN_PATTERNS, so
  // the tax id is misclassified as a landline number ('市話') and the
  // '統編' candidate is discarded entirely — even though isValidTaxId would
  // have validated it and the text is explicitly labeled '統一編號'.
  // This test encodes the intended behavior (landline and tax id as two
  // separate items) and is intentionally left failing against current src;
  // see the final report for evidence (actual detect() output).
  it('keeps the landline and tax id as separate, non-overlapping items', () => {
    const text = '電話 (02)2712-3456，統一編號 04595257';
    const items = detect(text, BUILTIN_PATTERNS);
    const landline = items.filter((i) => i.category === '市話');
    const taxId = items.filter((i) => i.category === '統編');
    expect(landline.map((i) => i.original)).toEqual(['(02)2712-3456']);
    expect(taxId.map((i) => i.original)).toEqual(['04595257']);
  });
});
