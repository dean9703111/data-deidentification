export type DocFormat = 'txt' | 'md' | 'docx' | 'xlsx' | 'pdf';

export const CATEGORIES = ['姓名', '身分證', '手機', '市話', '地址', '電子郵件', '公司', '統編', '識別碼'] as const;
export type Category = (typeof CATEGORIES)[number];

/** How much of a detected value stays visible outside the marker (see core/retention.ts). */
export type Retention =
  | { mode: 'none' }
  | { mode: 'ends'; head: number; tail: number }
  | { mode: 'delim'; delimiter: string; side: 'before' | 'after' }
  | { mode: 'surname' }
  | { mode: 'city' }
  | { mode: 'district' }
  /** Keep what the on-screen preview mask shows (王OO, A12******9…) with the code in place of the stars. */
  | { mode: 'preview' };

export interface Pattern {
  id: string;
  name: string;
  category: Category;
  source: 'builtin' | 'custom';
  regex: string;
  example: string;
  enabled: boolean;
  retention?: Retention;
  /** Builtin-only second-pass filter (e.g. checksum). `before` is the text right before the match. */
  validate?: (match: string, before: string) => boolean;
}

export interface RedactionItem {
  id: string;
  category: Category;
  original: string;
  start: number;
  end: number;
  code: string;
  origin: 'auto' | 'manual';
  active: boolean;
  /** Retention from the rule that detected it, or the one chosen when adding it manually. */
  retention?: Retention;
  /** Characters of `original` kept visible before / after the marker; absent means 0. */
  head?: number;
  tail?: number;
}

export interface MappingEntry {
  code: string;
  category: string;
  /** The hidden part only; the full value is prefix + original + suffix. */
  original: string;
  prefix?: string;
  suffix?: string;
}

/** A single replacement in the document's full text, expressed in text offsets. */
export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

/** Structure of the document expressed in full-text offsets, used only to render a format-aware preview. */
export interface DocxParagraphLayout {
  start: number;
  end: number;
  style: 'title' | 'heading' | 'normal';
  part: 'body' | 'header' | 'footer';
  table?: { id: number; row: number; col: number };
}
export interface XlsxCellLayout {
  start: number;
  end: number;
  row: number;
  col: number;
}
export interface PdfItemLayout {
  start: number;
  end: number;
  x: number;
  y: number;
  fontSize: number;
  width: number;
}
export type DocLayout =
  | { kind: 'docx'; paragraphs: DocxParagraphLayout[] }
  | { kind: 'xlsx'; sheets: { name: string; cells: XlsxCellLayout[] }[] }
  | { kind: 'pdf'; pages: { width: number; height: number; items: PdfItemLayout[] }[] };

export interface LoadedDocument {
  fileName: string;
  format: DocFormat;
  text: string;
  /** Format-specific data needed to regenerate the file with edits applied. */
  handle: unknown;
  /** Present for docx/xlsx/pdf; plain text formats have none. */
  layout?: DocLayout;
}

export interface CustomPatternConfig {
  id: string;
  name: string;
  category: Category;
  regex: string;
  example: string;
  enabled: boolean;
}

export interface PatternConfig {
  version: 1;
  disabledBuiltins: string[];
  customPatterns: CustomPatternConfig[];
  /** Retention per pattern id (builtin or custom); missing means hide everything. */
  retention?: Record<string, Retention>;
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
