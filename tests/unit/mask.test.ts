import { describe, it, expect } from 'vitest';
import { maskDisplay } from '../../src/core/mask';
import type { Category } from '../../src/core/types';

describe('maskDisplay', () => {
  describe('姓名', () => {
    it('masks a common 3-char name, keeping only the surname', () => {
      expect(maskDisplay('姓名', '王小明')).toBe('王OO');
    });

    it('masks another common 3-char name', () => {
      expect(maskDisplay('姓名', '林美玲')).toBe('林OO');
    });

    it('keeps a 2-char compound surname intact', () => {
      expect(maskDisplay('姓名', '歐陽志遠')).toBe('歐陽OO');
    });

    it('masks a 2-char name', () => {
      expect(maskDisplay('姓名', '王明')).toBe('王O');
    });

    it('never reveals more than the surname for a single-char name', () => {
      expect(maskDisplay('姓名', '王')).toBe('OO');
    });
  });

  describe('身分證', () => {
    it('keeps first 3 and last 1 characters', () => {
      expect(maskDisplay('身分證', 'A123456789')).toBe('A12******9');
    });
  });

  describe('手機', () => {
    it('masks a hyphenated mobile number', () => {
      expect(maskDisplay('手機', '0912-345-678')).toBe('0912-***-678');
    });

    it('masks a plain-digit mobile number', () => {
      expect(maskDisplay('手機', '0912345678')).toBe('0912-***-678');
    });

    it('masks a space-separated mobile number', () => {
      expect(maskDisplay('手機', '0912 345 678')).toBe('0912-***-678');
    });

    it('normalizes an international-format mobile number', () => {
      expect(maskDisplay('手機', '+886-955-123-456')).toBe('0955-***-456');
    });
  });

  describe('市話', () => {
    it('masks a landline with area code in parentheses (documents current behavior)', () => {
      expect(maskDisplay('市話', '(02)2712-3456')).toBe('02-****-56');
    });

    it('masks a landline with a 3-digit area code (documents current behavior)', () => {
      expect(maskDisplay('市話', '037-123456')).toBe('03-****-56');
    });
  });

  describe('地址', () => {
    it('masks a Taipei address, keeping city/district prefix', () => {
      expect(maskDisplay('地址', '台北市信義區市府路45號8樓')).toBe('台北市信義區***');
    });

    it('masks a New Taipei address, keeping city/district prefix', () => {
      expect(maskDisplay('地址', '新北市板橋區文化路一段188巷3號之2')).toBe('新北市板橋區***');
    });

    it('falls back to keepEnds when the input is only the city/district prefix', () => {
      // '台北市信義區' has length 6, and matches its own full length as prefix,
      // so it must not equal the original — falls back to keepEnds(3,0).
      expect(maskDisplay('地址', '台北市信義區')).toBe('台北市***');
      expect(maskDisplay('地址', '台北市信義區')).not.toBe('台北市信義區');
    });
  });

  describe('電子郵件', () => {
    it('masks a longer local-part email', () => {
      expect(maskDisplay('電子郵件', 'xiaoming.wang@example.com')).toBe('xi***@example.com');
    });

    it('masks a 1-char local-part email', () => {
      expect(maskDisplay('電子郵件', 'a@b.co')).toBe('a***@b.co');
    });
  });

  describe('識別碼', () => {
    it('masks a typical employee id, keeping first 3 chars', () => {
      expect(maskDisplay('識別碼', 'EMP-004521')).toBe('EMP*******');
    });

    it('fully masks a short id that is too short to keep a prefix', () => {
      expect(maskDisplay('識別碼', 'AB')).toBe('**');
    });
  });

  describe('generic invariants (all categories)', () => {
    const table: Array<{ category: Category; original: string }> = [
      { category: '姓名', original: '王小明' },
      { category: '身分證', original: 'A123456789' },
      { category: '手機', original: '0912-345-678' },
      { category: '市話', original: '(02)2712-3456' },
      { category: '地址', original: '台北市信義區市府路45號8樓' },
      { category: '電子郵件', original: 'xiaoming.wang@example.com' },
      { category: '識別碼', original: 'EMP-004521' },
    ];

    it.each(table)('masks $category without leaking the original and without being empty', ({ category, original }) => {
      const masked = maskDisplay(category, original);
      expect(masked).not.toBe(original);
      expect(masked.length).toBeGreaterThan(0);
    });
  });
});
