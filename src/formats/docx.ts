import JSZip from 'jszip';
import type { DocxParagraphLayout, LoadedDocument, TextEdit } from '../core/types';
import { distributeEdits, type Segment } from './segments';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PartInfo {
  path: string;
  doc: Document;
  nodes: Element[];
  segments: Segment[];
  paragraphs: DocxParagraphLayout[];
}

export interface DocxHandle {
  zip: JSZip;
  parts: PartInfo[];
}

function isW(el: Element, local: string): boolean {
  return el.namespaceURI === W_NS && el.localName === local;
}

let tableSeq = 0;

function styleOf(p: Element): DocxParagraphLayout['style'] {
  const val = p.getElementsByTagNameNS(W_NS, 'pStyle')[0]?.getAttributeNS(W_NS, 'val') ?? '';
  if (/title/i.test(val)) return 'title';
  if (/heading|^h\d/i.test(val)) return 'heading';
  return 'normal';
}

/** Walks a part in document order, collecting <w:t> nodes, the full text they form, and paragraph/table layout. */
function extractPart(path: string, doc: Document, offset: number): { part: PartInfo; text: string } {
  const nodes: Element[] = [];
  const segments: Segment[] = [];
  const paragraphs: DocxParagraphLayout[] = [];
  const partKind: DocxParagraphLayout['part'] = /header/.test(path) ? 'header' : /footer/.test(path) ? 'footer' : 'body';
  const tableStack: { id: number; row: number; col: number }[] = [];
  let text = '';

  const visit = (el: Element) => {
    if (el.namespaceURI === MC_NS && el.localName === 'Fallback') return;
    if (isW(el, 'del') || isW(el, 'delText')) return;
    if (isW(el, 'tbl')) {
      tableStack.push({ id: tableSeq++, row: -1, col: -1 });
      for (const child of Array.from(el.children)) visit(child);
      tableStack.pop();
      return;
    }
    if (isW(el, 'tr') && tableStack.length) {
      const t = tableStack[tableStack.length - 1];
      t.row++;
      t.col = -1;
      for (const child of Array.from(el.children)) visit(child);
      return;
    }
    if (isW(el, 'tc') && tableStack.length) {
      tableStack[tableStack.length - 1].col++;
      for (const child of Array.from(el.children)) visit(child);
      return;
    }
    if (isW(el, 'p')) {
      const start = offset + text.length;
      for (const child of Array.from(el.children)) visit(child);
      const t = tableStack[tableStack.length - 1];
      paragraphs.push({ start, end: offset + text.length, style: styleOf(el), part: partKind, table: t ? { id: t.id, row: t.row, col: t.col } : undefined });
      text += '\n';
      return;
    }
    if (isW(el, 't')) {
      const t = el.textContent ?? '';
      if (t.length > 0) {
        nodes.push(el);
        segments.push({ start: offset + text.length, end: offset + text.length + t.length, text: t });
        text += t;
      }
      return;
    }
    if (isW(el, 'tab')) {
      text += '\t';
      return;
    }
    if (isW(el, 'br') || isW(el, 'cr')) {
      text += '\n';
      return;
    }
    for (const child of Array.from(el.children)) visit(child);
  };

  visit(doc.documentElement);
  return { part: { path, doc, nodes, segments, paragraphs }, text };
}

function partOrder(paths: string[]): string[] {
  const main = paths.filter((p) => p === 'word/document.xml');
  const rest = paths.filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p)).sort();
  return [...main, ...rest];
}

export async function parseDocx(file: File): Promise<LoadedDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = partOrder(Object.keys(zip.files));
  if (!paths.includes('word/document.xml')) throw new Error('不是有效的 Word (.docx) 檔案');

  const parser = new DOMParser();
  const parts: PartInfo[] = [];
  let text = '';
  for (const path of paths) {
    const xml = await zip.file(path)!.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error(`無法解析 ${path}`);
    const { part, text: partText } = extractPart(path, doc, text.length);
    parts.push(part);
    text += partText;
    if (!text.endsWith('\n')) text += '\n';
  }
  const handle: DocxHandle = { zip, parts };
  const layout = { kind: 'docx' as const, paragraphs: parts.flatMap((p) => p.paragraphs) };
  return { fileName: file.name, format: 'docx', text, handle, layout };
}

function serialize(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`;
}

/** Every call works on a fresh clone of the pristine parts so repeated downloads stay correct. */
export async function generateDocx(doc: LoadedDocument, edits: TextEdit[]): Promise<Blob> {
  const handle = doc.handle as DocxHandle;
  for (const part of handle.parts) {
    const partStart = part.segments[0]?.start ?? 0;
    const partEnd = part.segments.at(-1)?.end ?? 0;
    const partEdits = edits.filter((e) => e.start < partEnd && e.end > partStart);

    const cloneDoc = part.doc.cloneNode(true) as Document;
    const { part: clone } = extractPart(part.path, cloneDoc, partStart);
    const changes = distributeEdits(clone.segments, partEdits);
    for (const [i, newText] of changes) {
      const node = clone.nodes[i];
      node.textContent = newText;
      node.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    }
    handle.zip.file(part.path, serialize(cloneDoc));
  }
  return handle.zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
