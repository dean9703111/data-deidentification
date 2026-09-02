// A tiny document model rendered to both .docx and .pdf so the same realistic
// content exists in both formats.

export interface TableColumn {
  header: string;
  /** Relative width; renderers scale to the page width. */
  width: number;
}

export type Block =
  | { type: 'title'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'para'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; indent?: boolean }
  | { type: 'kv'; rows: [string, string][] }
  | { type: 'table'; columns: TableColumn[]; rows: string[][] }
  | { type: 'spacer' }
  | { type: 'pageBreak' };

export interface DocModel {
  title: string;
  /** Shown in the page header (docx header part / PDF top line). */
  header: string;
  /** Shown in the page footer before the page number. */
  footer: string;
  blocks: Block[];
}
