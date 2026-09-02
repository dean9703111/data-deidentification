import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Block, DocModel } from './docmodel.ts';
import { sparseSubsetTtf } from '../../src/formats/ttf-subset.ts';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 64, bottom: 64, left: 56, right: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const GRAY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.55, 0.55, 0.55);

/** Word-wraps text: CJK characters break anywhere, Latin/digit tokens stay whole when possible. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const tokens = text.match(/[A-Za-z0-9@._+\-()#:/%]+|\s+|./gsu) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const tok of tokens) {
    if (tok === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const candidate = line + tok;
    // Closing punctuation never starts a line (kinsoku); let it overflow slightly instead.
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || /^[，。：；、）」』】》！？]$/.test(tok)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line.trimEnd());
    // Token itself wider than the line: hard-split by character.
    if (font.widthOfTextAtSize(tok, size) > maxWidth) {
      let piece = '';
      for (const ch of tok) {
        if (font.widthOfTextAtSize(piece + ch, size) > maxWidth) {
          lines.push(piece);
          piece = '';
        }
        piece += ch;
      }
      line = piece;
    } else {
      line = tok.trimStart();
    }
  }
  lines.push(line);
  return lines;
}

class Layout {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument, private font: PDFFont) {
    this.newPage();
  }
  newPage(): void {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN.top;
  }
  ensure(height: number): void {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }
  text(text: string, size: number, opts: { align?: 'left' | 'center' | 'right'; indent?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}): void {
    const indent = opts.indent ?? 0;
    const lines = wrap(this.font, text, size, CONTENT_WIDTH - indent);
    const lh = size * 1.55;
    for (const [i, line] of lines.entries()) {
      this.ensure(lh);
      const w = this.font.widthOfTextAtSize(line, size);
      let x = MARGIN.left + (i === 0 ? indent : 0);
      if (opts.align === 'center') x = MARGIN.left + (CONTENT_WIDTH - w) / 2;
      if (opts.align === 'right') x = PAGE.width - MARGIN.right - w;
      this.y -= lh;
      if (line) this.page.drawText(line, { x, y: this.y + size * 0.3, size, font: this.font, color: opts.color });
    }
    this.y -= opts.gap ?? size * 0.5;
  }
  table(columns: { header: string; width: number }[], rows: string[][]): void {
    const size = 9;
    const pad = 4;
    const total = columns.reduce((a, c) => a + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * CONTENT_WIDTH);
    const drawRow = (cells: string[], head: boolean) => {
      const wrapped = cells.map((c, i) => wrap(this.font, c, size, widths[i] - pad * 2));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = lines * size * 1.45 + pad * 2;
      if (this.y - h < MARGIN.bottom) {
        this.newPage();
        if (!head) drawRow(columns.map((c) => c.header), true);
      }
      let x = MARGIN.left;
      const top = this.y;
      widths.forEach((w, i) => {
        if (head) this.page.drawRectangle({ x, y: top - h, width: w, height: h, color: rgb(0.91, 0.91, 0.91) });
        this.page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: LINE, borderWidth: 0.6 });
        wrapped[i].forEach((line, li) => {
          this.page.drawText(line, { x: x + pad, y: top - pad - size * (li + 1) * 1.45 + size * 0.35, size, font: this.font });
        });
        x += w;
      });
      this.y -= h;
    };
    drawRow(columns.map((c) => c.header), true);
    for (const r of rows) drawRow(r, false);
    this.y -= 10;
  }
}

function renderBlock(l: Layout, b: Block): void {
  switch (b.type) {
    case 'title':
      l.text(b.text, 18, { align: 'center', gap: 6 });
      break;
    case 'subtitle':
      l.text(b.text, 10.5, { align: 'center', gap: 14, color: GRAY });
      break;
    case 'heading':
      l.ensure(40);
      l.y -= 6;
      l.text(b.text, 12.5, { gap: 4 });
      break;
    case 'para':
      l.text(b.text, 10.5, { align: b.align, indent: b.indent ? 21 : 0 });
      break;
    case 'kv':
      for (const [k, v] of b.rows) l.text(`${k}：${v}`, 10.5, { gap: 2 });
      l.y -= 6;
      break;
    case 'table':
      l.table(b.columns, b.rows);
      break;
    case 'spacer':
      l.y -= 14;
      break;
    case 'pageBreak':
      l.newPage();
      break;
  }
}

export async function renderPdf(doc: DocModel, fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(doc.title);
  const allText = doc.header + doc.footer + '第頁，共0123456789?' + doc.blocks.map((b) => JSON.stringify(b)).join('');
  const font = await pdf.embedFont(sparseSubsetTtf(fontBytes, allText), { subset: false });
  const layout = new Layout(pdf, font);
  for (const b of doc.blocks) renderBlock(layout, b);

  const n = layout.pages.length;
  layout.pages.forEach((page, i) => {
    page.drawText(doc.header, { x: PAGE.width - MARGIN.right - font.widthOfTextAtSize(doc.header, 8), y: PAGE.height - 40, size: 8, font, color: GRAY });
    page.drawLine({ start: { x: MARGIN.left, y: PAGE.height - 46 }, end: { x: PAGE.width - MARGIN.right, y: PAGE.height - 46 }, thickness: 0.5, color: LINE });
    const footer = `${doc.footer}　第 ${i + 1} 頁，共 ${n} 頁`;
    page.drawText(footer, { x: (PAGE.width - font.widthOfTextAtSize(footer, 8)) / 2, y: 36, size: 8, font, color: GRAY });
  });
  return pdf.save();
}
