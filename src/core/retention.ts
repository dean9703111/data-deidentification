import type { Category, Retention } from './types';
import { CITIES } from './patterns';
import { COMPANY_MASK_RE, COMPOUND_SURNAMES } from './mask';

export type RetentionMode = Retention['mode'];

export interface Split {
  head: number;
  tail: number;
}

const NONE: Split = { head: 0, tail: 0 };
const CITY_RE = new RegExp(`^${CITIES}`, 'u');
const DISTRICT_RE = /^[一-龥]{1,4}?[鄉鎮市區]/u;

export function modesFor(category: Category): RetentionMode[] {
  const modes: RetentionMode[] = ['none', 'ends', 'delim'];
  if (category === '姓名') modes.push('surname');
  if (category === '地址') modes.push('city', 'district');
  modes.push('preview');
  return modes;
}

export const MODE_LABELS: Record<RetentionMode, string> = {
  none: '全部隱藏',
  ends: '保留前／後幾碼',
  delim: '以分隔字元為界',
  surname: '保留姓氏',
  city: '保留到縣市',
  district: '保留到縣市＋鄉鎮市區',
  preview: '部分保留（標準）',
};

export function describeRetention(r: Retention | undefined): string {
  if (!r) return MODE_LABELS.none;
  switch (r.mode) {
    case 'ends': {
      const parts = [r.head > 0 ? `前 ${r.head} 碼` : '', r.tail > 0 ? `後 ${r.tail} 碼` : ''].filter(Boolean);
      return parts.length ? `保留${parts.join('＋')}` : MODE_LABELS.none;
    }
    case 'delim':
      return `保留「${r.delimiter}」${r.side === 'after' ? '之後' : '之前'}`;
    default:
      return MODE_LABELS[r.mode];
  }
}

/** Index just past the n-th digit, extended over the separators that follow it. */
function afterDigit(value: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i]) && ++seen === n) {
      let j = i + 1;
      while (j < value.length && !/\d/.test(value[j])) j++;
      return j;
    }
  }
  return value.length;
}

/**
 * The standard 部分保留: only the part of each value that is useful for statistics and weak for
 * re-identification (surname, ID region + sex, mobile carrier prefix, area code, district, email
 * domain, organisation type, first character of an identifier). 統編 stays fully hidden.
 */
export function standardSplit(category: Category, value: string): Split {
  switch (category) {
    case '姓名':
      return { head: COMPOUND_SURNAMES.some((s) => value.startsWith(s)) ? 2 : 1, tail: 0 };
    case '身分證':
      return { head: 2, tail: 0 };
    case '手機':
      return { head: afterDigit(value, 4), tail: 0 };
    case '市話': {
      const area = value.match(/^(?:\(0\d{1,3}\)|0\d{1,3}[-\s])/)?.[0];
      return { head: area ? area.length : afterDigit(value, 2), tail: 0 };
    }
    case '地址':
      return rawSplit(value, { mode: 'district' }, category);
    case '電子郵件': {
      const at = value.indexOf('@');
      return at > 0 ? { head: 0, tail: value.length - at } : NONE;
    }
    case '公司': {
      const m = value.match(COMPANY_MASK_RE);
      return m ? { head: 0, tail: m[3].length } : NONE;
    }
    case '統編':
      return NONE;
    default:
      return { head: 1, tail: 0 };
  }
}

function rawSplit(value: string, r: Retention, category: Category): Split {
  switch (r.mode) {
    case 'none':
      return NONE;
    case 'preview':
      return standardSplit(category, value);
    case 'ends':
      return { head: r.head, tail: r.tail };
    case 'delim': {
      if (!r.delimiter) return NONE;
      if (r.side === 'after') {
        const i = value.indexOf(r.delimiter);
        return i < 0 ? NONE : { head: 0, tail: value.length - i };
      }
      const i = value.lastIndexOf(r.delimiter);
      return i < 0 ? NONE : { head: i + r.delimiter.length, tail: 0 };
    }
    case 'surname':
      return { head: COMPOUND_SURNAMES.some((s) => value.startsWith(s)) ? 2 : 1, tail: 0 };
    case 'city':
    case 'district': {
      const city = value.match(CITY_RE)?.[0];
      if (!city) return NONE;
      if (r.mode === 'city') return { head: city.length, tail: 0 };
      const district = value.slice(city.length).match(DISTRICT_RE)?.[0] ?? '';
      return { head: city.length + district.length, tail: 0 };
    }
  }
}

/** Characters kept at each end of `value`; falls back to hiding everything unless at least one character stays hidden. */
export function splitFor(value: string, r: Retention | undefined, category: Category = '識別碼'): Split {
  if (!r) return NONE;
  const s = rawSplit(value, r, category);
  if (s.head < 0 || s.tail < 0 || s.head + s.tail >= value.length) return NONE;
  return s;
}

/** First value of a rule's example text, which may list several (「王小明、歐陽志遠」). */
export function firstExample(example: string): string {
  return example.split(/[、,，]/)[0].trim();
}

export interface RetentionCheck {
  error: string | null;
  warnings: string[];
}

/** Validates a retention setting against the rule's example value (FR-013–FR-015). */
export function checkRetention(example: string, r: Retention, category: Category = '識別碼'): RetentionCheck {
  const warnings: string[] = [];
  if (r.mode === 'preview') warnings.push('部分保留會露出部分字元（例如身分證前 2 碼、手機前 4 碼），並非完全匿名。');
  if (r.mode === 'ends') {
    if (!Number.isInteger(r.head) || !Number.isInteger(r.tail) || r.head < 0 || r.tail < 0) return { error: '保留位數必須是 0 以上的整數', warnings };
    if (r.head > 0 && r.tail > 0) warnings.push('前後同時保留，搭配其他欄位時較容易辨識出個人。');
  }
  if (r.mode === 'delim' && !r.delimiter) return { error: '請輸入分隔字元', warnings };
  if (r.mode !== 'ends' && r.mode !== 'delim' && r.mode !== 'preview') return { error: null, warnings };

  const ex = firstExample(example);
  if (!ex) return { error: null, warnings };
  if (r.mode === 'delim' && !ex.includes(r.delimiter)) {
    warnings.push(`範例「${ex}」中沒有「${r.delimiter}」，這類值會全部隱藏。`);
    return { error: null, warnings };
  }
  const raw = rawSplit(ex, r, category);
  const hidden = ex.length - raw.head - raw.tail;
  if (r.mode === 'preview') return { error: null, warnings };
  if (hidden <= 0) return { error: `這個設定會把範例「${ex}」整個保留下來，至少要隱藏 1 個字元。`, warnings };
  if (hidden < ex.length / 2) warnings.push(`範例「${ex}」只隱藏 ${hidden} / ${ex.length} 個字元（不到一半），重新識別的風險較高。`);
  return { error: null, warnings };
}

/** Accepts only well-formed retention objects read back from storage. */
export function sanitizeRetention(x: unknown): Retention | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  switch (r.mode) {
    case 'none':
    case 'surname':
    case 'city':
    case 'district':
    case 'preview':
      return { mode: r.mode };
    case 'ends':
      return Number.isInteger(r.head) && Number.isInteger(r.tail) && (r.head as number) >= 0 && (r.tail as number) >= 0
        ? { mode: 'ends', head: r.head as number, tail: r.tail as number }
        : null;
    case 'delim':
      return typeof r.delimiter === 'string' && r.delimiter && (r.side === 'before' || r.side === 'after')
        ? { mode: 'delim', delimiter: r.delimiter, side: r.side }
        : null;
    default:
      return null;
  }
}
