import type { Category } from './types';

const COMPOUND_SURNAMES = ['歐陽', '司馬', '諸葛', '上官', '張簡', '范姜', '司徒', '東方', '令狐', '南宮', '端木', '皇甫', '尉遲', '夏侯'];

function keepEnds(s: string, head: number, tail: number, fill = '*'): string {
  if (s.length <= head + tail) return fill.repeat(s.length);
  return s.slice(0, head) + fill.repeat(s.length - head - tail) + s.slice(s.length - tail);
}

/**
 * Human-friendly masked rendering for the on-screen preview only.
 * The downloaded file always uses the `[類別:編碼]` marker (see contracts/marker-format.md).
 */
export function maskDisplay(category: Category, original: string): string {
  switch (category) {
    case '姓名': {
      const surnameLen = COMPOUND_SURNAMES.some((s) => original.startsWith(s)) ? 2 : 1;
      if (original.length <= surnameLen) return 'O'.repeat(Math.max(2, original.length));
      return original.slice(0, surnameLen) + 'O'.repeat(original.length - surnameLen);
    }
    case '身分證':
      return keepEnds(original, 3, 1);
    case '手機': {
      const digits = original.replace(/\D/g, '').replace(/^886/, '0');
      if (digits.length === 10) return `${digits.slice(0, 4)}-***-${digits.slice(7)}`;
      return keepEnds(original, 4, 2);
    }
    case '市話': {
      const digits = original.replace(/\D/g, '');
      if (digits.length >= 8) return `${digits.slice(0, 2)}-****-${digits.slice(-2)}`;
      return keepEnds(original, 2, 2);
    }
    case '地址': {
      const m = original.match(/^(.*?[市縣])?(.*?[鄉鎮市區])?/u);
      const prefix = (m?.[1] ?? '') + (m?.[2] ?? '');
      return prefix.length > 0 && prefix.length < original.length ? `${prefix}***` : keepEnds(original, 3, 0);
    }
    case '電子郵件': {
      const at = original.indexOf('@');
      if (at > 0) return `${original.slice(0, Math.min(2, at))}***${original.slice(at)}`;
      return keepEnds(original, 2, 0);
    }
    case '公司': {
      const m = original.match(/^(.{2})(.*?)(股份有限公司|有限公司|無限公司|兩合公司|企業社|工作室|事務所|商行|診所|基金會|協會|合作社|工程行|企業行|實業社|文化事業)$/u);
      if (m) return m[2] ? `${m[1]}**${m[3]}` : `${m[1][0]}*${m[3]}`;
      return keepEnds(original, 2, 0);
    }
    case '統編':
      return keepEnds(original, 2, 1);
    case '識別碼':
    default:
      return keepEnds(original, 3, 0);
  }
}
