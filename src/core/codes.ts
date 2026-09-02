export const CODE_LENGTH = 6;

export const MARKER_REGEX = /\[([^\[\]:]{1,10}):([0-9a-f]{6})\]/g;

export function generateCode(used: Set<string>): string {
  const bytes = new Uint8Array(CODE_LENGTH / 2);
  for (let attempt = 0; attempt < 1000; attempt++) {
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error('無法產生不重複的編碼');
}

export function buildMarker(category: string, code: string): string {
  return `[${category}:${code}]`;
}

export interface ParsedMarker {
  category: string;
  code: string;
  start: number;
  end: number;
}

export function parseMarkers(text: string): ParsedMarker[] {
  const out: ParsedMarker[] = [];
  const re = new RegExp(MARKER_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ category: m[1], code: m[2], start: m.index, end: m.index + m[0].length });
  }
  return out;
}
