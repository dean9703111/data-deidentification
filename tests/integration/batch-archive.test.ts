import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { uniqueNamer, manifestCsv, buildArchive, type BatchEntry } from '../../src/formats/batch';
import { detect } from '../../src/core/detector';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { parseMapping } from '../../src/core/csv';
import { restore } from '../../src/core/restorer';
import { parsePlainText } from '../../src/formats/plaintext';
import { parseDocx } from '../../src/formats/docx';
import { parseXlsx } from '../../src/formats/xlsx';
import { buildDocx, toFile, SAMPLE_DOCX_SPEC } from '../helpers/docx-builder';
import { buildXlsx, toXlsxFile, SAMPLE_XLSX_SPEC } from '../helpers/xlsx-builder';

const SAMPLE_TXT_PATH = 'tests/fixtures/sample.txt';

async function entryFromText(fileName: string, text: string): Promise<BatchEntry> {
  const doc = await parsePlainText(new File([text], fileName), 'txt');
  const items = detect(doc.text, BUILTIN_PATTERNS);
  return { doc, items };
}

describe('uniqueNamer', () => {
  it('returns the first occurrence of a name unchanged', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
  });

  it('appends " (2)", " (3)"... before the extension for repeats', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
    expect(unique('a.txt')).toBe('a (2).txt');
    expect(unique('a.txt')).toBe('a (3).txt');
  });

  it('appends the counter directly (no extension) when the name has none', () => {
    const unique = uniqueNamer();
    expect(unique('README')).toBe('README');
    expect(unique('README')).toBe('README (2)');
  });

  it('leaves different names untouched', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
    expect(unique('b.txt')).toBe('b.txt');
    expect(unique('c.docx')).toBe('c.docx');
  });
});

describe('manifestCsv', () => {
  it('starts with a BOM', () => {
    expect(manifestCsv([]).charCodeAt(0)).toBe(0xfeff);
    expect(manifestCsv([]).startsWith('﻿')).toBe(true);
  });

  it('has the expected header', () => {
    const csv = manifestCsv([]);
    expect(csv.slice(1)).toContain('檔案,去識別化檔,編碼表,生效筆數');
  });

  it('uses CRLF line endings throughout', () => {
    const csv = manifestCsv([
      { source: 'a.txt', output: 'a.deid.txt', mapping: 'a.mapping.csv', count: 1 },
      { source: 'b.txt', output: 'b.deid.txt', mapping: 'b.mapping.csv', count: 2 },
    ]);
    // Every line break is a CRLF pair, never a lone \n.
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
    expect(csv.replace(/\r\n/g, '')).not.toContain('\r');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes a source name containing a comma per RFC 4180', () => {
    const csv = manifestCsv([{ source: 'a,b.txt', output: 'a,b.deid.txt', mapping: 'a,b.mapping.csv', count: 3 }]);
    const dataLine = csv.slice(1).split('\r\n')[1];
    expect(dataLine).toBe('"a,b.txt","a,b.deid.txt","a,b.mapping.csv",3');
  });
});

describe('buildArchive', () => {
  it('packs four entries (one with a colliding mapping name) into a 9-file archive with a correct manifest', async () => {
    const sampleTxt = readFileSync(SAMPLE_TXT_PATH, 'utf-8');
    const quoteTxt =
      '報價單編號：Q-2026-001\n' +
      '客戶：林美玲小姐，電話 0933-222-111，地址台北市大安區敦化南路一段100號。\n' +
      '聯絡信箱：mei.lin@example.com。\n';

    const txtEntry = await entryFromText('sample.txt', sampleTxt);
    const docxDoc = await parseDocx(toFile(await buildDocx(SAMPLE_DOCX_SPEC), '報價單.docx'));
    const docxEntry: BatchEntry = { doc: docxDoc, items: detect(docxDoc.text, BUILTIN_PATTERNS) };
    const xlsxDoc = await parseXlsx(toXlsxFile(await buildXlsx(SAMPLE_XLSX_SPEC), '客戶資料.xlsx'));
    const xlsxEntry: BatchEntry = { doc: xlsxDoc, items: detect(xlsxDoc.text, BUILTIN_PATTERNS) };
    const quoteEntry = await entryFromText('報價單.txt', quoteTxt);

    const entries = [txtEntry, docxEntry, xlsxEntry, quoteEntry];
    for (const e of entries) expect(e.items.filter((i) => i.active).length).toBeGreaterThan(0);

    const { blob, manifest } = await buildArchive(entries);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).sort();

    expect(names.length).toBe(9);
    expect(manifest.length).toBe(4);

    // Expected manifest rows, in entry order.
    expect(manifest[0]).toMatchObject({ source: 'sample.txt', output: 'sample.deid.txt', mapping: 'sample.mapping.csv' });
    expect(manifest[1]).toMatchObject({
      source: '報價單.docx',
      output: '報價單.deid.docx',
      mapping: '報價單.mapping.csv',
    });
    expect(manifest[2]).toMatchObject({
      source: '客戶資料.xlsx',
      output: '客戶資料.deid.xlsx',
      mapping: '客戶資料.mapping.csv',
    });
    // '報價單.txt' gets a distinct output name from '報價單.docx' (different extension),
    // but its mapping name collides with the docx entry's and must be disambiguated.
    expect(manifest[3]).toMatchObject({
      source: '報價單.txt',
      output: '報價單.deid.txt',
      mapping: '報價單.mapping (2).csv',
    });

    expect(names).toEqual(
      [
        'sample.deid.txt',
        'sample.mapping.csv',
        '報價單.deid.docx',
        '報價單.mapping.csv',
        '客戶資料.deid.xlsx',
        '客戶資料.mapping.csv',
        '報價單.deid.txt',
        '報價單.mapping (2).csv',
        '清單.csv',
      ].sort(),
    );

    // Per-entry checks: mapping row count, mapping CSV parses cleanly, output contains
    // every marker and none of the active originals, and (for the txt entries) restoring
    // the output with its mapping reproduces the original text exactly.
    for (const [i, entry] of entries.entries()) {
      const row = manifest[i];
      const activeItems = entry.items.filter((it) => it.active);
      expect(row.count).toBe(activeItems.length);

      const mappingText = await zip.file(row.mapping)!.async('string');
      const { entries: mappingEntries, errors } = parseMapping(mappingText);
      expect(errors).toEqual([]);
      expect(mappingEntries.length).toBe(row.count);

      const outBytes = await zip.file(row.output)!.async('uint8array');
      let outText: string;
      if (entry.doc.format === 'txt') {
        const outDoc = await parsePlainText(new File([outBytes as BlobPart], row.output), 'txt');
        outText = outDoc.text;
      } else if (entry.doc.format === 'docx') {
        const outDoc = await parseDocx(new File([outBytes as BlobPart], row.output));
        outText = outDoc.text;
      } else {
        const outDoc = await parseXlsx(new File([outBytes as BlobPart], row.output));
        outText = outDoc.text;
      }

      for (const m of mappingEntries) {
        expect(outText).toContain(`[${m.category}:${m.code}]`);
      }
      for (const item of activeItems) {
        expect(outText.includes(item.original)).toBe(false);
      }

      if (entry.doc.format === 'txt') {
        const restored = restore(outText, mappingEntries);
        expect(restored.missingCodes).toEqual([]);
        expect(restored.restoredText).toBe(entry.doc.text);
      }
    }
  });

  it('still produces an output file and an empty (header-only) mapping csv for an entry with zero active items', async () => {
    const entry = await entryFromText('empty.txt', 'Hello world, this is a plain test file with no personal data at all.');
    expect(entry.items.length).toBe(0);

    const { blob, manifest } = await buildArchive([entry]);
    expect(manifest).toEqual([
      { source: 'empty.txt', output: 'empty.deid.txt', mapping: 'empty.mapping.csv', count: 0 },
    ]);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('empty.deid.txt')!.async('string')).toBe(entry.doc.text);

    const mappingText = await zip.file('empty.mapping.csv')!.async('string');
    const { entries, errors } = parseMapping(mappingText);
    expect(errors).toEqual([]);
    expect(entries).toEqual([]);
    // Header-only: BOM + header line + trailing CRLF, no data rows.
    expect(mappingText).toBe('﻿code,category,original\r\n');
  });

  it('writes 清單.csv equal to manifestCsv(manifest)', async () => {
    const entry = await entryFromText('a.txt', '客戶 陳大文 的電話是 0912-345-678。');
    const { blob, manifest } = await buildArchive([entry]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const listCsv = await zip.file('清單.csv')!.async('string');
    expect(listCsv).toBe(manifestCsv(manifest));
  });
});
