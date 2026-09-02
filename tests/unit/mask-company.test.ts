import { describe, it, expect } from 'vitest';
import { maskDisplay } from '../../src/core/mask';

describe('maskDisplay for 公司', () => {
  it('masks a 股份有限公司 name, keeping the first 2 chars and the suffix', () => {
    expect(maskDisplay('公司', '築夢實業股份有限公司')).toBe('築夢**股份有限公司');
  });

  // When the text before the suffix is exactly 2 characters long (e.g. '大安'
  // + '診所'), the non-greedy middle group m[2] captures empty. src/core/mask.ts
  // guards this case explicitly (`m[2] ? ... : \`${m[1][0]}*${m[3]}\``) so the
  // masked prefix is still shortened by one character instead of returning the
  // name unchanged — preserving the "masked value must differ from the
  // original" invariant enforced elsewhere in mask.test.ts.
  it('still masks part of the prefix when there is no middle to mask', () => {
    const masked = maskDisplay('公司', '大安診所');
    expect(masked).toBe('大*診所');
    expect(masked).not.toBe('大安診所');
  });
});

describe('maskDisplay for 統編', () => {
  it('keeps the first 2 and last 1 digit of the tax id', () => {
    expect(maskDisplay('統編', '04595257')).toBe('04*****7');
  });
});
