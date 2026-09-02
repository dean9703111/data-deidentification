import { describe, it, expect } from 'vitest';
import { isValidTaxId } from '../../src/core/twid';

/** Mirrors the checksum algorithm documented on isValidTaxId, for brute-forcing test fixtures. */
const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

function digitSum(n: number): number {
  return Math.floor(n / 10) + (n % 10);
}

function weightedTotal(digits: number[]): number {
  return digits.reduce((sum, d, i) => sum + digitSum(d * WEIGHTS[i]), 0);
}

describe('isValidTaxId', () => {
  it('accepts a known-valid tax id', () => {
    expect(isValidTaxId('04595257')).toBe(true);
  });

  it('accepts brute-force-generated valid ids for several 7-digit heads', () => {
    const heads = ['1234567', '9876543', '0000001', '5566778'];
    for (const head of heads) {
      const headDigits = head.split('').map(Number);
      let found = false;
      for (let d = 0; d <= 9; d++) {
        const total = weightedTotal([...headDigits, d]);
        if (total % 5 === 0) {
          const id = head + String(d);
          expect(isValidTaxId(id)).toBe(true);
          found = true;
          break;
        }
      }
      // Sanity check: among 10 candidate last digits at least one always
      // lands on a multiple of 5 (10 values cover every residue mod 5 twice).
      expect(found).toBe(true);
    }
  });

  it('rejects an id with an invalid checksum', () => {
    // digits 1,2,3,4,5,6,7,8 -> weighted digit-sum total = 33.
    const digits = '12345678'.split('').map(Number);
    const total = weightedTotal(digits);
    expect(total % 5).not.toBe(0); // 33 % 5 === 3
    expect((total + 1) % 5).not.toBe(0); // the 7th-digit-7 exception doesn't apply either: 34 % 5 === 4
    expect(isValidTaxId('12345678')).toBe(false);
  });

  it('rejects strings that are too short', () => {
    expect(isValidTaxId('1234567')).toBe(false);
  });

  it('rejects strings that are too long', () => {
    expect(isValidTaxId('123456789')).toBe(false);
  });

  it('rejects strings containing non-digit characters', () => {
    expect(isValidTaxId('A2345678')).toBe(false);
  });

  it('accepts an id via the 7th-digit-7 exception (total % 5 === 4)', () => {
    // Fix the first 7 digits so the 7th digit is '7', then brute-force the
    // last digit so the raw weighted total lands on residue 4 mod 5 — exactly
    // the case the exception rule exists for.
    const headDigits = [1, 2, 3, 4, 5, 6, 7]; // headDigits[6] === 7
    let match: { id: string; total: number } | undefined;
    for (let d = 0; d <= 9; d++) {
      const total = weightedTotal([...headDigits, d]);
      if (total % 5 === 4) {
        match = { id: headDigits.join('') + String(d), total };
        break;
      }
    }
    expect(match).toBeDefined();
    expect(match!.id[6]).toBe('7');
    expect(match!.total % 5).toBe(4);
    // Without the exception this would be rejected (total % 5 !== 0); the
    // exception (id[6] === '7' and (total + 1) % 5 === 0) makes it valid.
    expect(isValidTaxId(match!.id)).toBe(true);
  });
});
