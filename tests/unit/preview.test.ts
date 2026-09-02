import { describe, it, expect, beforeAll } from 'vitest';
import { renderDocumentPreview } from '../../src/ui/preview';
import type { Decoration } from '../../src/ui/preview';
import type { DocLayout, LoadedDocument } from '../../src/core/types';

// jsdom has no layout engine (getBoundingClientRect() is all zeros) and may not implement
// ResizeObserver at all. The pdf renderer only *reads* layout to decide whether to stretch text
// items to their original width; with zero-sized rects that stretch never fires, so we simply
// never assert on `transform`. We still need a ResizeObserver so `renderPdf` doesn't throw.
beforeAll(() => {
  if (typeof (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
});

function makeDoc(text: string, layout?: DocLayout): LoadedDocument {
  return {
    fileName: 'test',
    format: layout?.kind ?? 'txt',
    text,
    handle: null,
    layout,
  };
}

describe('renderDocumentPreview — plain text', () => {
  it('renders plain spans around a mark decoration, replacing the original text with its label', () => {
    const container = document.createElement('div');
    const text = 'abc王小明def';
    const doc = makeDoc(text);
    const decorations: Decoration[] = [
      { start: 3, end: 6, id: 'r1', kind: 'mark', label: '王OO', className: 'mark-姓名', tip: 'T' },
    ];

    renderDocumentPreview(container, doc, decorations);

    const plain = container.querySelector('.preview-plain');
    expect(plain).not.toBeNull();
    const children = Array.from(plain!.children) as HTMLElement[];
    expect(children).toHaveLength(3);

    const [span1, mark, span2] = children;
    expect(span1.tagName).toBe('SPAN');
    expect(span1.dataset.plain).toBe('true');
    expect(span1.dataset.start).toBe('0');
    expect(span1.textContent).toBe('abc');

    expect(mark.tagName).toBe('MARK');
    expect(mark.classList.contains('mark')).toBe(true);
    expect(mark.classList.contains('mark-姓名')).toBe(true);
    expect(mark.classList.contains('has-tip')).toBe(true);
    expect(mark.dataset.id).toBe('r1');
    expect(mark.dataset.start).toBe('3');
    expect(mark.dataset.end).toBe('6');
    expect(mark.dataset.tip).toBe('T');
    expect(mark.textContent).toBe('王OO');

    expect(span2.tagName).toBe('SPAN');
    expect(span2.dataset.start).toBe('6');
    expect(span2.textContent).toBe('def');

    expect(container.textContent).toBe('abc王OOdef');
  });

  it('renders a cancelled decoration with the original text', () => {
    const container = document.createElement('div');
    const text = 'abc王小明def';
    const doc = makeDoc(text);
    const decorations: Decoration[] = [
      { start: 3, end: 6, id: 'c1', kind: 'cancelled', label: '王OO', className: 'mark-姓名', tip: 'T2' },
    ];

    renderDocumentPreview(container, doc, decorations);

    const span = container.querySelector('span.cancelled') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.classList.contains('has-tip')).toBe(true);
    expect(span.classList.contains('mark-姓名')).toBe(true);
    expect(span.dataset.id).toBe('c1');
    // The cancelled decoration shows the ORIGINAL text, not the label.
    expect(span.textContent).toBe('王小明');
    expect(container.querySelector('mark')).toBeNull();
  });

  it('renders a restored decoration as a mark carrying its label', () => {
    const container = document.createElement('div');
    const text = 'abc王小明def';
    const doc = makeDoc(text);
    const decorations: Decoration[] = [
      { start: 3, end: 6, id: 'r2', kind: 'restored', label: '王小明', className: 'mark-姓名', tip: 'T3' },
    ];

    renderDocumentPreview(container, doc, decorations);

    const mark = container.querySelector('mark') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.classList.contains('mark')).toBe(true);
    expect(mark.dataset.id).toBe('r2');
    expect(mark.textContent).toBe('王小明');
  });
});

describe('renderDocumentPreview — clipping across ranges', () => {
  it('clips a decoration spanning a paragraph boundary, keeping the label only where it starts', () => {
    const container = document.createElement('div');
    const text = 'AB CD';
    const layout: DocLayout = {
      kind: 'docx',
      paragraphs: [
        { start: 0, end: 2, style: 'normal', part: 'body' },
        { start: 3, end: 5, style: 'normal', part: 'body' },
      ],
    };
    const doc = makeDoc(text, layout);
    const decorations: Decoration[] = [
      { start: 1, end: 4, id: 'x1', kind: 'mark', label: 'X', className: 'mark-x', tip: '' },
    ];

    renderDocumentPreview(container, doc, decorations);

    const page = container.querySelector('.doc-page') as HTMLElement;
    const paragraphs = Array.from(page.querySelectorAll(':scope > p.doc-p')) as HTMLElement[];
    expect(paragraphs).toHaveLength(2);

    const mark1 = paragraphs[0].querySelector('mark') as HTMLElement;
    expect(mark1).not.toBeNull();
    expect(mark1.textContent).toBe('X');
    expect(mark1.classList.contains('mark-cont')).toBe(false);
    expect(mark1.dataset.id).toBe('x1');

    const mark2 = paragraphs[1].querySelector('mark') as HTMLElement;
    expect(mark2).not.toBeNull();
    expect(mark2.textContent).toBe('');
    expect(mark2.classList.contains('mark-cont')).toBe(true);
    expect(mark2.dataset.id).toBe('x1');

    expect(container.textContent).not.toContain('B');
    expect(container.textContent).not.toContain('C');
  });
});

describe('renderDocumentPreview — docx layout', () => {
  it('renders paragraph styles, and an empty paragraph as a <br>', () => {
    const container = document.createElement('div');
    const text = 'AAABBBCCC';
    const layout: DocLayout = {
      kind: 'docx',
      paragraphs: [
        { start: 0, end: 3, style: 'title', part: 'body' },
        { start: 3, end: 6, style: 'heading', part: 'body' },
        { start: 6, end: 9, style: 'normal', part: 'body' },
        { start: 9, end: 9, style: 'normal', part: 'body' },
      ],
    };
    const doc = makeDoc(text, layout);

    renderDocumentPreview(container, doc, []);

    const page = container.querySelector('.doc-page') as HTMLElement;
    expect(page).not.toBeNull();
    const ps = Array.from(page.querySelectorAll(':scope > p.doc-p')) as HTMLElement[];
    expect(ps).toHaveLength(4);

    expect(ps[0].classList.contains('doc-title')).toBe(true);
    expect(ps[0].textContent).toBe('AAA');
    expect(ps[1].classList.contains('doc-heading')).toBe(true);
    expect(ps[1].textContent).toBe('BBB');
    expect(ps[2].classList.contains('doc-normal')).toBe(true);
    expect(ps[2].textContent).toBe('CCC');

    expect(ps[3].classList.contains('doc-normal')).toBe(true);
    expect(ps[3].textContent).toBe('');
    expect(ps[3].querySelector('br')).not.toBeNull();
  });

  it('boxes header/footer parts, placing the header before and the footer after the body paragraphs', () => {
    const container = document.createElement('div');
    const text = 'HEADBODYFOOT';
    const layout: DocLayout = {
      kind: 'docx',
      paragraphs: [
        { start: 0, end: 4, style: 'normal', part: 'header' },
        { start: 4, end: 8, style: 'normal', part: 'body' },
        { start: 8, end: 12, style: 'normal', part: 'footer' },
      ],
    };
    const doc = makeDoc(text, layout);

    renderDocumentPreview(container, doc, []);

    const page = container.querySelector('.doc-page') as HTMLElement;
    const children = Array.from(page.children) as HTMLElement[];
    expect(children).toHaveLength(3);

    expect(children[0].classList.contains('doc-part')).toBe(true);
    expect(children[0].classList.contains('doc-part-header')).toBe(true);
    expect(children[0].querySelector('.doc-part-label')?.textContent).toBe('頁首');
    expect(children[0].textContent).toContain('HEAD');

    expect(children[1].classList.contains('doc-p')).toBe(true);
    expect(children[1].textContent).toBe('BODY');

    expect(children[2].classList.contains('doc-part')).toBe(true);
    expect(children[2].classList.contains('doc-part-footer')).toBe(true);
    expect(children[2].querySelector('.doc-part-label')?.textContent).toBe('頁尾');
    expect(children[2].textContent).toContain('FOOT');
  });

  it('groups consecutive same-id table paragraphs into a table, keeps a following plain paragraph outside it, and starts a new table for a different id', () => {
    const container = document.createElement('div');
    const text = 'ABCDEFGH';
    const layout: DocLayout = {
      kind: 'docx',
      paragraphs: [
        { start: 0, end: 1, style: 'normal', part: 'body', table: { id: 0, row: 0, col: 0 } },
        { start: 1, end: 2, style: 'normal', part: 'body', table: { id: 0, row: 0, col: 0 } },
        { start: 2, end: 3, style: 'normal', part: 'body', table: { id: 0, row: 0, col: 1 } },
        { start: 3, end: 4, style: 'normal', part: 'body', table: { id: 0, row: 1, col: 0 } },
        { start: 4, end: 5, style: 'normal', part: 'body', table: { id: 0, row: 1, col: 1 } },
        { start: 5, end: 6, style: 'normal', part: 'body' },
        { start: 6, end: 7, style: 'normal', part: 'body', table: { id: 1, row: 0, col: 0 } },
        { start: 7, end: 8, style: 'normal', part: 'body', table: { id: 1, row: 0, col: 1 } },
      ],
    };
    const doc = makeDoc(text, layout);

    renderDocumentPreview(container, doc, []);

    const page = container.querySelector('.doc-page') as HTMLElement;
    const children = Array.from(page.children) as HTMLElement[];
    expect(children).toHaveLength(3);

    const table1 = children[0] as HTMLTableElement;
    expect(table1.tagName).toBe('TABLE');
    expect(table1.classList.contains('doc-table')).toBe(true);
    expect(table1.querySelectorAll('tr')).toHaveLength(2);
    const tds1 = table1.querySelectorAll('td');
    expect(tds1).toHaveLength(4);
    expect(tds1[0].querySelectorAll('p')).toHaveLength(2);
    expect(tds1[0].textContent).toBe('AB');
    expect(tds1[1].textContent).toBe('C');
    expect(tds1[2].textContent).toBe('D');
    expect(tds1[3].textContent).toBe('E');

    expect(children[1].tagName).toBe('P');
    expect(children[1].textContent).toBe('F');
    expect(children[1].closest('table')).toBeNull();

    const table2 = children[2] as HTMLTableElement;
    expect(table2.tagName).toBe('TABLE');
    expect(table2.classList.contains('doc-table')).toBe(true);
    expect(table2.querySelectorAll('tr')).toHaveLength(1);
    expect(table2.querySelectorAll('td')).toHaveLength(2);
    expect(table2.textContent).toBe('GH');
  });
});

describe('renderDocumentPreview — xlsx layout', () => {
  it('renders sheet tabs and a lettered/numbered grid, and switches sheets on tab click', () => {
    const container = document.createElement('div');
    const text = 'N1N2N3S1S2';
    const layout: DocLayout = {
      kind: 'xlsx',
      sheets: [
        {
          name: '客戶',
          cells: [
            { start: 0, end: 2, row: 1, col: 1 },
            { start: 2, end: 4, row: 1, col: 2 },
            { start: 4, end: 6, row: 2, col: 3 },
          ],
        },
        {
          name: '訂單',
          cells: [
            { start: 6, end: 8, row: 1, col: 1 },
            { start: 8, end: 10, row: 1, col: 2 },
          ],
        },
      ],
    };
    const doc = makeDoc(text, layout);

    renderDocumentPreview(container, doc, []);

    const tabs = Array.from(container.querySelectorAll('.sheet-tabs button.sheet-tab')) as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toBe('客戶（3）');
    expect(tabs[1].textContent).toBe('訂單（2）');
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);

    const table = container.querySelector('table.sheet-table') as HTMLTableElement;
    expect(table).not.toBeNull();
    const rows = table.querySelectorAll('tr');
    expect(rows).toHaveLength(3); // header row + 2 data rows

    const headerCells = Array.from(rows[0].querySelectorAll('th')).map((th) => th.textContent);
    expect(headerCells).toEqual(['', 'A', 'B', 'C']);

    const row1Tds = rows[1].querySelectorAll('td');
    expect(rows[1].querySelector('th')?.textContent).toBe('1');
    expect(row1Tds[0].textContent).toBe('N1');
    expect(row1Tds[1].textContent).toBe('N2');
    expect(row1Tds[2].textContent).toBe(''); // empty cell

    const row2Tds = rows[2].querySelectorAll('td');
    expect(rows[2].querySelector('th')?.textContent).toBe('2');
    expect(row2Tds[0].textContent).toBe(''); // empty cell
    expect(row2Tds[1].textContent).toBe(''); // empty cell
    expect(row2Tds[2].textContent).toBe('N3'); // (row 2, col 3) -> 2nd data row, 3rd data column

    expect(container.textContent).toContain('N1');
    expect(container.textContent).not.toContain('S1');

    tabs[1].click();

    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(container.textContent).toContain('S1');
    expect(container.textContent).not.toContain('N1');
  });
});

describe('renderDocumentPreview — pdf layout', () => {
  it('renders pages with positioned items and applies decorations, marks carrying data-id', () => {
    const container = document.createElement('div');
    const text = 'HelloWorld';
    const layout: DocLayout = {
      kind: 'pdf',
      pages: [
        {
          width: 100,
          height: 200,
          items: [
            { start: 0, end: 5, x: 10, y: 150, fontSize: 12, width: 40 },
            { start: 5, end: 10, x: 60, y: 150, fontSize: 12, width: 50 },
          ],
        },
      ],
    };
    const doc = makeDoc(text, layout);
    const decorations: Decoration[] = [
      { start: 5, end: 10, id: 'p1', kind: 'mark', label: 'W', className: 'mark-w', tip: 't' },
    ];

    renderDocumentPreview(container, doc, decorations);

    const host = container.querySelector('.pdf-pages') as HTMLElement;
    expect(host).not.toBeNull();

    const label = host.querySelector('.pdf-page-label') as HTMLElement;
    expect(label.textContent).toBe('第 1 頁 / 共 1 頁');

    const pages = host.querySelectorAll('.pdf-page');
    expect(pages).toHaveLength(1);
    const page = pages[0] as HTMLElement;
    expect(page.style.getPropertyValue('--w')).toBe('100');

    const items = page.querySelectorAll('.pdf-item');
    expect(items).toHaveLength(2);

    const item1 = items[0] as HTMLElement;
    expect(item1.dataset.w).toBe('40');
    expect(item1.style.left).toContain('var(--s)');
    expect(item1.style.left).toContain('10');
    expect(item1.style.fontSize).toContain('var(--s)');
    expect(item1.style.fontSize).toContain('12');
    expect(item1.textContent).toBe('Hello');

    const item2 = items[1] as HTMLElement;
    expect(item2.dataset.w).toBe('50');
    expect(item2.textContent).toBe('W');
    const mark = item2.querySelector('mark') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.dataset.id).toBe('p1');
  });
});

describe('renderDocumentPreview — opts.plain and preview-structured', () => {
  it('falls back to plain rendering and omits preview-structured when opts.plain is true, even with a layout', () => {
    const container = document.createElement('div');
    const layout: DocLayout = { kind: 'docx', paragraphs: [{ start: 0, end: 2, style: 'normal', part: 'body' }] };
    const doc = makeDoc('AB', layout);

    renderDocumentPreview(container, doc, [], { plain: true });

    expect(container.querySelector('.preview-plain')).not.toBeNull();
    expect(container.classList.contains('preview-structured')).toBe(false);
  });

  it('adds preview-structured and renders the layout when a layout is present and no opts are given', () => {
    const container = document.createElement('div');
    const layout: DocLayout = { kind: 'docx', paragraphs: [{ start: 0, end: 2, style: 'normal', part: 'body' }] };
    const doc = makeDoc('AB', layout);

    renderDocumentPreview(container, doc, []);

    expect(container.classList.contains('preview-structured')).toBe(true);
    expect(container.querySelector('.doc-page')).not.toBeNull();
    expect(container.querySelector('.preview-plain')).toBeNull();
  });
});

describe('renderDocumentPreview — re-render', () => {
  it('clears a previous plain render before drawing the next one', () => {
    const container = document.createElement('div');
    renderDocumentPreview(container, makeDoc('hello'), []);
    expect(container.querySelectorAll('.preview-plain')).toHaveLength(1);

    renderDocumentPreview(container, makeDoc('world'), []);
    expect(container.querySelectorAll('.preview-plain')).toHaveLength(1);
    expect(container.textContent).toBe('world');
  });

  it('clears a previous structured render before drawing the next one', () => {
    const container = document.createElement('div');
    const layout: DocLayout = { kind: 'docx', paragraphs: [{ start: 0, end: 2, style: 'normal', part: 'body' }] };
    const doc = makeDoc('AB', layout);

    renderDocumentPreview(container, doc, []);
    expect(container.querySelectorAll('.doc-page')).toHaveLength(1);

    renderDocumentPreview(container, doc, []);
    expect(container.querySelectorAll('.doc-page')).toHaveLength(1);
  });

  it('keeps the active sheet when an xlsx layout is re-rendered into the same container', () => {
    const container = document.createElement('div');
    const layout: DocLayout = {
      kind: 'xlsx',
      sheets: [
        { name: 'A', cells: [{ start: 0, end: 2, row: 1, col: 1 }] },
        { name: 'B', cells: [{ start: 2, end: 4, row: 1, col: 1 }] },
      ],
    };
    const doc = makeDoc('AASS', layout);

    renderDocumentPreview(container, doc, []);
    (container.querySelectorAll('.sheet-tab')[1] as HTMLButtonElement).click();
    expect(container.textContent).toContain('SS');

    renderDocumentPreview(container, doc, []);

    const tabs = container.querySelectorAll('.sheet-tab');
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(container.textContent).toContain('SS');
    expect(container.textContent).not.toContain('AA');
  });
});
