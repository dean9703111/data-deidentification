import type { DocFormat, LoadedDocument, TextEdit } from '../core/types';
import { applyEdits } from '../core/redactor';

export async function parsePlainText(file: File, format: 'txt' | 'md'): Promise<LoadedDocument> {
  const text = await file.text();
  return { fileName: file.name, format, text, handle: null };
}

export function generatePlainText(doc: LoadedDocument, edits: TextEdit[]): Blob {
  const text = applyEdits(doc.text, edits);
  const mime: Record<DocFormat, string> = {
    txt: 'text/plain;charset=utf-8',
    md: 'text/markdown;charset=utf-8',
    docx: '',
    xlsx: '',
    pdf: '',
  };
  return new Blob([text], { type: mime[doc.format] });
}
