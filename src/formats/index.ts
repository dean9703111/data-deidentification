import type { DocFormat, LoadedDocument, TextEdit } from '../core/types';
import { MAX_FILE_BYTES } from '../core/types';
import { generatePlainText, parsePlainText } from './plaintext';

export const SUPPORTED_EXTENSIONS: Record<string, DocFormat> = {
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  docx: 'docx',
  xlsx: 'xlsx',
  pdf: 'pdf',
};

export const ACCEPT_ATTR = '.txt,.md,.markdown,.docx,.xlsx,.pdf';

export function detectFormat(fileName: string): DocFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_EXTENSIONS[ext] ?? null;
}

export function validateFile(file: File): DocFormat {
  const format = detectFormat(file.name);
  if (!format) throw new Error('不支援的檔案格式，請上傳 PDF、Word (.docx)、Excel (.xlsx)、TXT 或 Markdown');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`檔案超過 ${MAX_FILE_BYTES / 1024 / 1024} MB 上限`);
  }
  return format;
}

export async function parseDocument(file: File): Promise<LoadedDocument> {
  const format = validateFile(file);
  switch (format) {
    case 'txt':
    case 'md':
      return parsePlainText(file, format);
    case 'docx':
      return (await import('./docx')).parseDocx(file);
    case 'xlsx':
      return (await import('./xlsx')).parseXlsx(file);
    case 'pdf':
      return (await import('./pdf')).parsePdf(file);
  }
}

export async function generateDocument(doc: LoadedDocument, edits: TextEdit[]): Promise<Blob> {
  switch (doc.format) {
    case 'txt':
    case 'md':
      return generatePlainText(doc, edits);
    case 'docx':
      return (await import('./docx')).generateDocx(doc, edits);
    case 'xlsx':
      return (await import('./xlsx')).generateXlsx(doc, edits);
    case 'pdf':
      return (await import('./pdf')).generatePdf(doc, edits);
  }
}

export function outputFileName(original: string, suffix: string): string {
  const dot = original.lastIndexOf('.');
  if (dot <= 0) return `${original}.${suffix}`;
  return `${original.slice(0, dot)}.${suffix}${original.slice(dot)}`;
}

export function mappingFileName(original: string): string {
  const dot = original.lastIndexOf('.');
  const base = dot <= 0 ? original : original.slice(0, dot);
  return `${base}.mapping.csv`;
}

export function formatLimitations(format: DocFormat): string | null {
  if (format === 'pdf') {
    return 'PDF 輸出為文字版面重建：文字依原座標繪回，但圖片、圖形與原字型不會保留。此做法確保輸出檔內不殘留任何原始敏感文字。';
  }
  if (format === 'xlsx') {
    return 'Excel 輸出保留儲存格樣式與工作表結構；僅處理文字型儲存格，以數值儲存的電話／證號、公式結果、工作表名稱與註解不在偵測範圍。';
  }
  if (format === 'docx') {
    return 'Word 輸出保留原有樣式與表格；文字方塊、註解等特殊區域可能未涵蓋，請以預覽為準。';
  }
  return null;
}
