import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { detect } from '../../src/core/detector';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { parseMarkers } from '../../src/core/codes';
import type { RedactionItem } from '../../src/core/types';
import { parseDocx, generateDocx } from '../../src/formats/docx';
import { parsePdf, generatePdf } from '../../src/formats/pdf';
import { parseXlsx, generateXlsx } from '../../src/formats/xlsx';
import { contract, quotation, customers, supportEmail, meetingNotes } from '../../scripts/lib/documents.ts';
import { renderDocx } from '../../scripts/lib/render-docx.ts';
import { renderPdf } from '../../scripts/lib/render-pdf.ts';
import { buildXlsx } from '../helpers/xlsx-builder.ts';

const FONT = new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'));

const ID_RE = /[A-Z][12]\d{8}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE_RE = /09\d{2}[-\x20]?\d{3}[-\x20]?\d{3}/g;

beforeAll(() => {
  // The font is fetched from the static site at runtime; serve it from disk here.
  vi.stubGlobal('fetch', async () => new Response(FONT));
  // Vite's `?url` worker path is not importable under Node; point pdf.js at the file directly.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL('node_modules/pdfjs-dist/build/pdf.worker.min.mjs').href;
});

function toDocxFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
function toPdfFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}
function toXlsxFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function countActive(items: RedactionItem[], category: string): number {
  return items.filter((i) => i.active && i.category === category).length;
}

/** For every occurrence of `regex` in `text`, checks it lies fully inside some active item's range. */
function coverage(text: string, regex: RegExp, items: RedactionItem[]): { total: number; missed: string[] } {
  const ranges = items.filter((i) => i.active).map((i) => ({ start: i.start, end: i.end }));
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let total = 0;
  const missed: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    total++;
    const s = m.index;
    const e = m.index + m[0].length;
    if (!ranges.some((r) => s >= r.start && e <= r.end)) missed.push(m[0]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return { total, missed };
}

/** Scans every non-directory zip part as text and asserts none of them match `regex`. */
async function assertNoZipPartMatches(bytes: Uint8Array | ArrayBuffer, regex: RegExp): Promise<void> {
  const zip = await JSZip.loadAsync(bytes);
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    if (/\.(png|jpe?g|gif|ttf|otf|woff2?|bin|emf|wmf)$/i.test(path)) continue; // exclude binary parts
    const content = await entry.async('string');
    expect(content, `${path} matched ${regex} unexpectedly`).not.toMatch(regex);
  }
}

describe('realistic contract (docx)', () => {
  it('detects the expected categories with full completeness for ID/email/mobile', async () => {
    const model = contract();
    const bytes = await renderDocx(model);
    const file = toDocxFile(bytes, 'contract.docx');
    const doc = await parseDocx(file);

    expect(doc.text.length).toBeGreaterThan(2000);
    expect(doc.text).toContain('契約編號 SC-2026-0917');

    const items = detect(doc.text, BUILTIN_PATTERNS);
    expect(countActive(items, '身分證')).toBeGreaterThanOrEqual(3);
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(8);
    expect(countActive(items, '地址')).toBeGreaterThanOrEqual(4);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(8);
    expect(countActive(items, '姓名')).toBeGreaterThanOrEqual(10);

    const idCov = coverage(doc.text, ID_RE, items);
    expect(idCov.missed, `uncovered IDs: ${JSON.stringify(idCov.missed)}`).toEqual([]);
    const emailCov = coverage(doc.text, EMAIL_RE, items);
    expect(emailCov.missed, `uncovered emails: ${JSON.stringify(emailCov.missed)}`).toEqual([]);
    const mobileCov = coverage(doc.text, MOBILE_RE, items);
    expect(mobileCov.missed, `uncovered mobiles: ${JSON.stringify(mobileCov.missed)}`).toEqual([]);
  });

  it('redacts, regenerates, and restores back to the exact original text', async () => {
    const model = contract();
    const bytes = await renderDocx(model);
    const originalDoc = await parseDocx(toDocxFile(bytes, 'contract.docx'));

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);

    const blob = await generateDocx(originalDoc, edits);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const newDoc = await parseDocx(toDocxFile(outBytes, 'contract-redacted.docx'));

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    expect(newDoc.text).not.toMatch(ID_RE);

    const markers = parseMarkers(newDoc.text);
    expect(markers.length).toBe(mapping.length);

    const restored = restore(newDoc.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText).toBe(originalDoc.text);

    const restoredBlob = await generateDocx(newDoc, restored.edits);
    const restoredDoc = await parseDocx(
      toDocxFile(new Uint8Array(await restoredBlob.arrayBuffer()), 'contract-restored.docx'),
    );
    expect(restoredDoc.text).toBe(originalDoc.text);

    // Confirm the header text survives regeneration.
    expect(newDoc.text).toMatch(/\[姓名:[0-9a-f]{6}\]/);

    // No ID anywhere in the raw output archive.
    await assertNoZipPartMatches(outBytes, ID_RE);
  });
});

describe('realistic contract (pdf)', () => {
  it('parses 3 pages with expected headings and full completeness for ID/email/mobile', async () => {
    const model = contract();
    const bytes = await renderPdf(model, FONT);
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    expect(pageCount).toBe(3);

    const doc = await parsePdf(toPdfFile(bytes, 'contract.pdf'));
    expect(doc.text).toContain('委外服務契約書');
    expect(doc.text).toContain('第十二條');

    const items = detect(doc.text, BUILTIN_PATTERNS);
    expect(countActive(items, '身分證')).toBeGreaterThanOrEqual(3);
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(8);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(8);

    // Completeness measured against the extracted text: a value split across lines by
    // pdf.js text extraction will not match the regex here either, so this is a fair test.
    const idCov = coverage(doc.text, ID_RE, items);
    expect(idCov.missed, `uncovered IDs: ${JSON.stringify(idCov.missed)}`).toEqual([]);
    const emailCov = coverage(doc.text, EMAIL_RE, items);
    expect(emailCov.missed, `uncovered emails: ${JSON.stringify(emailCov.missed)}`).toEqual([]);
    const mobileCov = coverage(doc.text, MOBILE_RE, items);
    expect(mobileCov.missed, `uncovered mobiles: ${JSON.stringify(mobileCov.missed)}`).toEqual([]);
  });

  it('redacts, regenerates, and restores back to the extracted text (whitespace-insensitive)', async () => {
    const model = contract();
    const bytes = await renderPdf(model, FONT);
    const originalDoc = await parsePdf(toPdfFile(bytes, 'contract.pdf'));

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);

    const blob = await generatePdf(originalDoc, edits);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const newDoc = await parsePdf(toPdfFile(outBytes, 'contract-redacted.pdf'));

    const newPageCount = (await PDFDocument.load(outBytes)).getPageCount();
    expect(newPageCount).toBe(3);

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }

    const markers = parseMarkers(newDoc.text);
    expect(markers.length).toBe(mapping.length);

    const raw = Buffer.from(outBytes).toString('latin1');
    expect(raw).not.toMatch(ID_RE);

    const restored = restore(newDoc.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText.replace(/\s/g, '')).toBe(originalDoc.text.replace(/\s/g, ''));
  });
});

describe('realistic quotation (docx)', () => {
  it('round-trips with lighter category assertions', async () => {
    const model = quotation();
    const bytes = await renderDocx(model);
    const originalDoc = await parseDocx(toDocxFile(bytes, 'quotation.docx'));

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(5);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(4);
    expect(countActive(items, '地址')).toBeGreaterThanOrEqual(5);

    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generateDocx(originalDoc, edits);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const newDoc = await parseDocx(toDocxFile(outBytes, 'quotation-redacted.docx'));

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    const markers = parseMarkers(newDoc.text);
    expect(markers.length).toBe(mapping.length);

    const restored = restore(newDoc.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText).toBe(originalDoc.text);

    await assertNoZipPartMatches(outBytes, ID_RE);
  });
});

describe('realistic quotation (pdf)', () => {
  it('parses 3 pages and round-trips with lighter category assertions', async () => {
    const model = quotation();
    const bytes = await renderPdf(model, FONT);
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    expect(pageCount).toBe(3);

    const originalDoc = await parsePdf(toPdfFile(bytes, 'quotation.pdf'));
    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(5);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(4);
    expect(countActive(items, '地址')).toBeGreaterThanOrEqual(5);

    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generatePdf(originalDoc, edits);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const newDoc = await parsePdf(toPdfFile(outBytes, 'quotation-redacted.pdf'));

    const newPageCount = (await PDFDocument.load(outBytes)).getPageCount();
    expect(newPageCount).toBe(3);

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    const markers = parseMarkers(newDoc.text);
    expect(markers.length).toBe(mapping.length);

    const restored = restore(newDoc.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText.replace(/\s/g, '')).toBe(originalDoc.text.replace(/\s/g, ''));
  });
});

describe('realistic customers workbook (xlsx)', () => {
  it('detects and round-trips 60 customer rows without leaking IDs or names', async () => {
    const spec = customers();
    const xlsxBytes = await buildXlsx(spec);
    const originalDoc = await parseXlsx(toXlsxFile(xlsxBytes, 'customers.xlsx'));

    const custLines = originalDoc.text.split('\n').filter((l) => /^CUST-\d+\t/.test(l));
    expect(custLines.length).toBe(60);
    const customerNames = custLines.map((l) => l.split('\t')[1]);
    expect(customerNames.length).toBe(60);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    expect(countActive(items, '身分證')).toBeGreaterThanOrEqual(60);
    const idCov = coverage(originalDoc.text, ID_RE, items);
    expect(idCov.missed, `uncovered IDs: ${JSON.stringify(idCov.missed)}`).toEqual([]);

    // Numeric column (累計消費) values are not processed at all (documented limitation).
    const consumptionValues = spec.sheets[0].rows.slice(1).map((r) => r[13] as number);
    for (const v of consumptionValues.slice(0, 10)) {
      expect(originalDoc.text).not.toContain(String(v));
    }

    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generateXlsx(originalDoc, edits);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const newDoc = await parseXlsx(toXlsxFile(outBytes, 'customers-redacted.xlsx'));

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    const markers = parseMarkers(newDoc.text);
    expect(markers.length).toBe(mapping.length);

    const newZip = await JSZip.loadAsync(outBytes);
    const sst = await newZip.file('xl/sharedStrings.xml')!.async('string');
    expect(sst).not.toMatch(ID_RE);
    for (const name of customerNames) {
      expect(sst, `sharedStrings.xml still contains customer name ${name}`).not.toContain(name);
    }

    const restored = restore(newDoc.text, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText).toBe(originalDoc.text);
  });
});

describe('realistic plain-text documents', () => {
  it('detects and round-trips supportEmail() character-for-character', () => {
    const original = supportEmail();
    const items = detect(original, BUILTIN_PATTERNS);

    expect(countActive(items, '身分證')).toBeGreaterThanOrEqual(1);
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(3);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(2);
    expect(countActive(items, '地址')).toBeGreaterThanOrEqual(2);

    const { redactedText, mapping } = applyRedactions(original, items);
    const restored = restore(redactedText, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText).toBe(original);
  });

  it('detects and round-trips meetingNotes() character-for-character', () => {
    const original = meetingNotes();
    const items = detect(original, BUILTIN_PATTERNS);

    expect(countActive(items, '身分證')).toBeGreaterThanOrEqual(1);
    // meetingNotes() (seed 505) only writes 2 mobile numbers into its fixed content
    // (confirmed by direct inspection), so 3 would never pass regardless of detection;
    // both of the 2 present are correctly detected.
    expect(countActive(items, '手機')).toBeGreaterThanOrEqual(2);
    expect(countActive(items, '電子郵件')).toBeGreaterThanOrEqual(2);
    expect(countActive(items, '地址')).toBeGreaterThanOrEqual(2);

    const { redactedText, mapping } = applyRedactions(original, items);
    const restored = restore(redactedText, mapping);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredText).toBe(original);
  });
});
