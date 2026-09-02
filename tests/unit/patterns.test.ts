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

describe('BUILTIN_PATTERNS sanity', () => {
  it('includes exactly the expected builtin ids', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['zh-name', 'tw-id', 'tw-mobile', 'tw-landline', 'tw-address', 'email']),
    );
  });
});

describe('tw-id pattern', () => {
  it('matches a valid ID', () => {
    expect(matches('tw-id', '身分證 A123456789 已核對')).toEqual(['A123456789']);
  });

  it('matches a valid ID embedded with no surrounding spaces', () => {
    expect(matches('tw-id', '(A123456789)')).toEqual(['A123456789']);
  });

  it('matches a second valid ID', () => {
    expect(matches('tw-id', '配偶 B223456782 附卷')).toEqual(['B223456782']);
  });

  it('does not match an ID with a bad checksum', () => {
    expect(matches('tw-id', 'A123456788')).toEqual([]);
  });

  it('does not match when a letter directly precedes it', () => {
    expect(matches('tw-id', 'XA123456789')).toEqual([]);
  });

  it('does not match when there is an extra trailing digit', () => {
    expect(matches('tw-id', 'A1234567890')).toEqual([]);
  });
});

describe('tw-mobile pattern', () => {
  it('matches plain digits', () => {
    expect(matches('tw-mobile', '0912345678')).toEqual(['0912345678']);
  });

  it('matches dash-separated digits', () => {
    expect(matches('tw-mobile', '0912-345-678')).toEqual(['0912-345-678']);
  });

  it('matches space-separated digits', () => {
    expect(matches('tw-mobile', '0912 345 678')).toEqual(['0912 345 678']);
  });

  it('matches the +886 international form', () => {
    expect(matches('tw-mobile', '+886-912-345-678')).toEqual(['+886-912-345-678']);
  });

  it('does not match a number starting 1912345678', () => {
    expect(matches('tw-mobile', '1912345678')).toEqual([]);
  });

  it('does not match an 11-digit run', () => {
    expect(matches('tw-mobile', '09123456789')).toEqual([]);
  });

  it('does not match a 9-digit run', () => {
    expect(matches('tw-mobile', '091234567')).toEqual([]);
  });
});

describe('tw-landline pattern', () => {
  it('matches a parenthesized area code', () => {
    expect(matches('tw-landline', '(02)2712-3456')).toEqual(['(02)2712-3456']);
  });

  it('matches a dash-separated area code', () => {
    expect(matches('tw-landline', '02-27123456')).toEqual(['02-27123456']);
  });

  it('matches a 3-digit area code', () => {
    expect(matches('tw-landline', '037-123456')).toEqual(['037-123456']);
  });

  it('matches another 2-digit area code', () => {
    expect(matches('tw-landline', '07-3368888')).toEqual(['07-3368888']);
  });

  it('does not match a mobile number', () => {
    expect(matches('tw-landline', '0912345678')).toEqual([]);
  });

  it('does not match a bare 8-digit number with no area code', () => {
    expect(matches('tw-landline', '12345678')).toEqual([]);
  });
});

describe('tw-address pattern', () => {
  it('matches a full address exactly', () => {
    expect(matches('tw-address', '台北市信義區市府路45號8樓')).toEqual(['台北市信義區市府路45號8樓']);
  });

  it('matches an address with lane/alley/number-suffix', () => {
    expect(matches('tw-address', '新北市板橋區文化路一段188巷3號之2')).toEqual([
      '新北市板橋區文化路一段188巷3號之2',
    ]);
  });

  it('matches an address using the alternate 臺 character', () => {
    expect(matches('tw-address', '臺中市西屯區台灣大道三段99號')).toEqual(['臺中市西屯區台灣大道三段99號']);
  });

  it('matches another full address', () => {
    expect(matches('tw-address', '高雄市苓雅區四維三路2號')).toEqual(['高雄市苓雅區四維三路2號']);
  });

  it('does not match a city/agency name with no street number', () => {
    expect(matches('tw-address', '高雄市政府')).toEqual([]);
  });

  it('does not match a bare city name', () => {
    expect(matches('tw-address', '台北市')).toEqual([]);
  });

  it('does not match a bare "number" fragment with no road', () => {
    expect(matches('tw-address', '第3號')).toEqual([]);
  });
});

describe('email pattern', () => {
  it('matches an address with a plus tag', () => {
    expect(matches('email', 'a.b+c@example.com')).toEqual(['a.b+c@example.com']);
  });

  it('matches an address with a subdomain', () => {
    expect(matches('email', 'lee.hsiaohua@hospital.example.org')).toEqual([
      'lee.hsiaohua@hospital.example.org',
    ]);
  });

  it('does not match plain text', () => {
    expect(matches('email', 'not an email')).toEqual([]);
  });

  it('does not match an address with no domain suffix', () => {
    expect(matches('email', 'a@b')).toEqual([]);
  });
});

describe('zh-name pattern', () => {
  it('extracts a name before 先生', () => {
    expect(matches('zh-name', '王小明先生')).toEqual(['王小明']);
  });

  it('extracts a name before 女士', () => {
    expect(matches('zh-name', '林美玲女士')).toEqual(['林美玲']);
  });

  it('extracts a compound-surname name before punctuation', () => {
    expect(matches('zh-name', '歐陽志遠（')).toEqual(['歐陽志遠']);
  });

  it('extracts a name preceded by a title and followed by 於', () => {
    expect(matches('zh-name', '社工陳大文於')).toEqual(['陳大文']);
  });

  it('does not match "國王與王子的故事"', () => {
    expect(matches('zh-name', '國王與王子的故事')).toEqual([]);
  });

  it('does not match "高雄市政府"', () => {
    expect(matches('zh-name', '高雄市政府')).toEqual([]);
  });

  it('does not match "方法論"', () => {
    expect(matches('zh-name', '方法論')).toEqual([]);
  });

  // KNOWN SRC BUG (src/core/patterns.ts): the zh-name heuristic matches '何人'
  // inside '任何人' because '何' is a listed single-character surname and
  // '何人' is not in NAME_STOPLIST (only '何時'/'何況'/'何謂'/'何必' are).
  // This test encodes the spec's required behavior (tasks.md T019) and is
  // intentionally left failing against current src; see final report.
  it('does not match "任何人"', () => {
    expect(matches('zh-name', '任何人')).toEqual([]);
  });
});
