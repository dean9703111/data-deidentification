import { describe, it, expect } from 'vitest';
import { isValidTwId } from '../../src/core/twid';

describe('isValidTwId', () => {
  it('accepts valid IDs with correct checksums', () => {
    expect(isValidTwId('A123456789')).toBe(true);
    expect(isValidTwId('F131104093')).toBe(true);
    expect(isValidTwId('B223456782')).toBe(true);
  });

  it('rejects an ID with an invalid checksum', () => {
    expect(isValidTwId('A123456788')).toBe(false);
  });

  it('rejects a lowercase leading letter', () => {
    expect(isValidTwId('a123456789')).toBe(false);
  });

  it('rejects a second digit that is not 1 or 2', () => {
    expect(isValidTwId('A323456789')).toBe(false);
  });

  it('rejects strings that are too short', () => {
    expect(isValidTwId('A12345678')).toBe(false);
  });

  it('rejects strings that are too long', () => {
    expect(isValidTwId('A1234567890')).toBe(false);
  });

  it('rejects strings that do not start with a letter', () => {
    expect(isValidTwId('1123456789')).toBe(false);
  });
});
