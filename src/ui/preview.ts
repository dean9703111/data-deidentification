import type { DocxParagraphLayout, LoadedDocument } from '../core/types';
import { clear, el } from './components';

/** A highlighted span of the full text: an active redaction, a cancelled one, or a restored value. */
export interface Decoration {
  start: number;
  end: number;
  id?: string;
  kind: 'mark' | 'cancelled' | 'restored';
  /** Text shown in place of the original for 'mark' and 'restored'. */
  label: string;
  className: string;
  tip: string;
}

export interface PreviewOptions {
  /** Ignore the document layout and show plain text. */
  plain?: boolean;
}

/**
 * Renders `doc.text[start, end)` into `parent` as plain text spans (data-start/data-plain) and
 * decoration elements (data-id/data-start/data-end/data-tip). A decoration that crosses the
 * range boundary is clipped; its label appears only in the piece where it starts.
 */
function renderRange(parent: Node, text: string, start: number, end: number, decos: Decoration[]): void {
  let cursor = start;
  for (const d of decos) {
    if (d.end <= start) continue;
    if (d.start >= end) break;
    const dStart = Math.max(d.start, start);
    const dEnd = Math.min(d.end, end);
    if (dStart > cursor) parent.appendChild(textSpan(text.slice(cursor, dStart), cursor));
    const attrs: Record<string, string> = { 'data-start': String(d.start), 'data-end': String(d.end), 'data-tip': d.tip };
    if (d.id) attrs['data-id'] = d.id;
    const first = d.start >= start;
    if (d.kind === 'cancelled') {
      parent.appendChild(el('span', { ...attrs, class: `cancelled has-tip ${d.className}` }, text.slice(dStart, dEnd)));
    } else {
      parent.appendChild(el('mark', { ...attrs, class: `mark has-tip ${d.className}${first ? '' : ' mark-cont'}` }, first ? d.label : ''));
    }
    cursor = dEnd;
  }
  if (cursor < end) parent.appendChild(textSpan(text.slice(cursor, end), cursor));
}

function textSpan(text: string, start: number): HTMLElement {
  return el('span', { 'data-start': String(start), 'data-plain': 'true' }, text);
}

function renderPlain(container: HTMLElement, doc: LoadedDocument, decos: Decoration[]): void {
  const box = el('div', { class: 'preview-plain' });
  renderRange(box, doc.text, 0, doc.text.length, decos);
  container.append(box);
}

// ---------------------------------------------------------------------------------------
// Word: paragraphs, headings and tables inside a page-like sheet; header/footer parts boxed.
// ---------------------------------------------------------------------------------------
function renderDocx(container: HTMLElement, doc: LoadedDocument, decos: Decoration[], paragraphs: DocxParagraphLayout[]): void {
  const page = el('div', { class: 'doc-page' });
  const parts: DocxParagraphLayout['part'][] = ['header', 'body', 'footer'];
  for (const part of parts) {
    const list = paragraphs.filter((p) => p.part === part);
    if (list.length === 0) continue;
    const host = part === 'body' ? page : el('div', { class: `doc-part doc-part-${part}` }, el('div', { class: 'doc-part-label' }, part === 'header' ? '頁首' : '頁尾'));
    let i = 0;
    while (i < list.length) {
      const p = list[i];
      if (!p.table) {
        host.append(paragraphEl(p, doc.text, decos));
        i++;
        continue;
      }
      const id = p.table.id;
      const cells = new Map<string, DocxParagraphLayout[]>();
      let rows = 0;
      let cols = 0;
      while (i < list.length && list[i].table?.id === id) {
        const q = list[i];
        const key = `${q.table!.row},${q.table!.col}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(q);
        rows = Math.max(rows, q.table!.row + 1);
        cols = Math.max(cols, q.table!.col + 1);
        i++;
      }
      const table = el('table', { class: 'doc-table' });
      for (let r = 0; r < rows; r++) {
        const tr = el('tr', {});
        for (let c = 0; c < cols; c++) {
          const td = el('td', {});
          for (const q of cells.get(`${r},${c}`) ?? []) td.append(paragraphEl(q, doc.text, decos));
          tr.append(td);
        }
        table.append(tr);
      }
      host.append(table);
    }
    if (part !== 'body') page.append(host);
  }
  container.append(page);
}

function paragraphEl(p: DocxParagraphLayout, text: string, decos: Decoration[]): HTMLElement {
  const node = el('p', { class: `doc-p doc-${p.style}` });
  if (p.end > p.start) renderRange(node, text, p.start, p.end, decos);
  else node.append(el('br', {}));
  return node;
}

// ---------------------------------------------------------------------------------------
// Excel: sheet tabs plus a grid with column letters and row numbers.
// ---------------------------------------------------------------------------------------
const MAX_ROWS = 1000;

function colName(i: number): string {
  let s = '';
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function renderXlsx(container: HTMLElement, doc: LoadedDocument, decos: Decoration[], sheets: { name: string; cells: { start: number; end: number; row: number; col: number }[] }[]): void {
  const state = { active: 0 };
  const tabs = el('div', { class: 'sheet-tabs' });
  const host = el('div', { class: 'sheet-host' });
  const draw = () => {
    clear(host);
    for (const [i, t] of Array.from(tabs.children).entries()) t.classList.toggle('active', i === state.active);
    const sheet = sheets[state.active];
    const byCell = new Map<string, { start: number; end: number }>();
    let maxRow = 0;
    let maxCol = 0;
    for (const c of sheet.cells) {
      byCell.set(`${c.row},${c.col}`, c);
      maxRow = Math.max(maxRow, c.row);
      maxCol = Math.max(maxCol, c.col);
    }
    const table = el('table', { class: 'sheet-table' });
    const head = el('tr', {}, el('th', {}, ''));
    for (let c = 1; c <= maxCol; c++) head.append(el('th', {}, colName(c)));
    table.append(head);
    const rows = Math.min(maxRow, MAX_ROWS);
    for (let r = 1; r <= rows; r++) {
      const tr = el('tr', {}, el('th', {}, String(r)));
      for (let c = 1; c <= maxCol; c++) {
        const td = el('td', {});
        const cell = byCell.get(`${r},${c}`);
        if (cell) renderRange(td, doc.text, cell.start, cell.end, decos);
        tr.append(td);
      }
      table.append(tr);
    }
    host.append(el('div', { class: 'sheet-scroll' }, table));
    if (maxRow > MAX_ROWS) host.append(el('p', { class: 'muted small' }, `僅顯示前 ${MAX_ROWS} 列（共 ${maxRow} 列）；未顯示的列仍會被處理。`));
  };
  sheets.forEach((s, i) => {
    tabs.append(el('button', { class: 'sheet-tab', type: 'button', onClick: () => { state.active = i; draw(); } }, `${s.name}（${s.cells.length}）`));
  });
  container.append(tabs, host);
  draw();
}

// ---------------------------------------------------------------------------------------
// PDF: each page as a box with text items at their original positions, scaled to fit.
// ---------------------------------------------------------------------------------------
function renderPdf(container: HTMLElement, doc: LoadedDocument, decos: Decoration[], pages: { width: number; height: number; items: { start: number; end: number; x: number; y: number; fontSize: number; width: number }[] }[]): void {
  const host = el('div', { class: 'pdf-pages' });
  pages.forEach((pg, i) => {
    const page = el('div', { class: 'pdf-page' });
    page.style.setProperty('--w', String(pg.width));
    page.style.setProperty('--h', String(pg.height));
    page.style.height = `calc(var(--s) * ${pg.height}px)`;
    for (const it of pg.items) {
      const span = el('span', { class: 'pdf-item', 'data-w': String(it.width) });
      span.style.left = `calc(var(--s) * ${it.x}px)`;
      span.style.top = `calc(var(--s) * ${pg.height - it.y - it.fontSize * 0.8}px)`;
      span.style.fontSize = `calc(var(--s) * ${it.fontSize}px)`;
      renderRange(span, doc.text, it.start, it.end, decos);
      page.append(span);
    }
    host.append(el('div', { class: 'pdf-page-label' }, `第 ${i + 1} 頁 / 共 ${pages.length} 頁`), page);
  });
  container.append(host);
  const fit = () => {
    const width = host.clientWidth || 700;
    for (const page of host.querySelectorAll<HTMLElement>('.pdf-page')) {
      const s = width / Number(page.style.getPropertyValue('--w'));
      page.style.setProperty('--s', String(s));
      // Browser font metrics differ from the PDF's; stretch each item to its original width
      // (the same trick pdf.js uses for its text layer) so items line up instead of overlapping.
      for (const item of page.querySelectorAll<HTMLElement>('.pdf-item')) {
        item.style.transform = '';
        const target = Number(item.dataset.w) * s;
        const actual = item.getBoundingClientRect().width;
        if (target > 0 && actual > 0) item.style.transform = `scaleX(${target / actual})`;
      }
    }
  };
  fit();
  new ResizeObserver(fit).observe(host);
}

export function renderDocumentPreview(container: HTMLElement, doc: LoadedDocument, decorations: Decoration[], opts: PreviewOptions = {}): void {
  clear(container);
  const decos = [...decorations].sort((a, b) => a.start - b.start);
  const layout = opts.plain ? undefined : doc.layout;
  container.classList.toggle('preview-structured', !!layout);
  if (!layout) return renderPlain(container, doc, decos);
  switch (layout.kind) {
    case 'docx':
      return renderDocx(container, doc, decos, layout.paragraphs);
    case 'xlsx':
      return renderXlsx(container, doc, decos, layout.sheets);
    case 'pdf':
      return renderPdf(container, doc, decos, layout.pages);
  }
}
