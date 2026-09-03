import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { parseMarkers } from '../../src/core/codes';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { parseXlsx, generateXlsx } from '../../src/formats/xlsx';
import { buildXlsx, toXlsxFile, SAMPLE_XLSX_SPEC, type XlsxSpec } from '../helpers/xlsx-builder';

describe('xlsx round trip', () => {
  it('parses cell text with tab/newline/blank-line structure, and skips numeric cells', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const doc = await parseXlsx(file);

    expect(doc.text).toContain('王小明');
    expect(doc.text).toContain('A123456789');
    expect(doc.text).toContain('Email: xiaoming.wang@example.com');
    expect(doc.text).toContain('聯絡人：歐陽志遠');
    expect(doc.text).toContain('陳大文');
    expect(doc.text).toContain('(02)2712-3456');

    // Documented limitation: numeric cells (e.g. the phone number stored as a raw
    // number 912345678 in row 3) are not processed at all.
    expect(doc.text).not.toContain('912345678');

    // Cells in a row are tab-joined; rows are newline-joined.
    expect(doc.text).toContain('姓名\t身分證字號\t手機\t地址\t備註');
    expect(doc.text).toContain(
      '王小明\tA123456789\t0912-345-678\t台北市信義區市府路45號8樓\tEmail: xiaoming.wang@example.com',
    );
    expect(doc.text).toContain('林美玲\tB223456782\t新北市板橋區文化路一段188巷3號之2\t聯絡人：歐陽志遠');
    expect(doc.text).toContain('承辦社工\t陳大文');
    expect(doc.text).toContain('市話\t(02)2712-3456');

    // Sheets are separated by a blank line: sheet 1's last row ("...同上") is followed
    // by a blank line and then sheet 2's first row ("承辦社工...").
    expect(doc.text).toContain('同上\n\n承辦社工');
  });

  it('redacts every active item, regenerates the xlsx, and gives both shared-string 王小明 cells one code', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const originalDoc = await parseXlsx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);

    const blob = await generateXlsx(originalDoc, edits);
    const newFile = toXlsxFile(new Uint8Array(await blob.arrayBuffer()), 'redacted.xlsx');
    const newDoc = await parseXlsx(newFile);

    const markerCodes = parseMarkers(newDoc.text).map((m) => m.code);
    expect(new Set(markerCodes)).toEqual(new Set(mapping.map((m) => m.code)));

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    expect(newDoc.text).not.toContain('A123456789');

    // 王小明 appears in two cells that share ONE sharedStrings entry in the input. Each cell is
    // a separate detected item, but the same value shares one code, so the mapping lists it once.
    const wangItems = items.filter((i) => i.original === '王小明');
    expect(wangItems.length).toBe(2);
    expect(wangItems[0].code).toBe(wangItems[1].code);
    expect(mapping.filter((m) => m.original === '王小明')).toHaveLength(1);
  });

  it('preserves styles.xml, scrubs orphaned shared strings, and rewrites only changed cells as inline strings', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const originalDoc = await parseXlsx(file);
    const originalZip = await JSZip.loadAsync(bytes);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits } = applyRedactions(originalDoc.text, items);
    const blob = await generateXlsx(originalDoc, edits);
    const newZip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(await newZip.file('xl/styles.xml')!.async('string')).toBe(
      await originalZip.file('xl/styles.xml')!.async('string'),
    );
    // sharedStrings.xml keeps its entry count (indexes stay valid for untouched cells) but
    // every entry no longer referenced by a cell is blanked so no original can linger.
    const sst = new DOMParser().parseFromString(await newZip.file('xl/sharedStrings.xml')!.async('string'), 'application/xml');
    const sstOrig = new DOMParser().parseFromString(await originalZip.file('xl/sharedStrings.xml')!.async('string'), 'application/xml');
    const entries = Array.from(sst.getElementsByTagName('si')).map((si) => si.textContent ?? '');
    const origEntries = Array.from(sstOrig.getElementsByTagName('si')).map((si) => si.textContent ?? '');
    expect(entries.length).toBe(origEntries.length);
    expect(entries[origEntries.indexOf('姓名')]).toBe('姓名');
    expect(entries[origEntries.indexOf('王小明')]).toBe('');
    expect(entries[origEntries.indexOf('A123456789')]).toBe('');

    const sheet1Xml = await newZip.file('xl/worksheets/sheet1.xml')!.async('string');
    const sheet1Doc = new DOMParser().parseFromString(sheet1Xml, 'application/xml');
    const cellByRef = (ref: string) =>
      Array.from(sheet1Doc.getElementsByTagName('c')).find((c) => c.getAttribute('r') === ref)!;

    // A2 held 王小明 as a shared string; it must now be an inline string that keeps its
    // style (s="1") and its cell reference (r="A2").
    const a2 = cellByRef('A2');
    expect(a2.getAttribute('t')).toBe('inlineStr');
    expect(a2.getAttribute('s')).toBe('1');
    expect(a2.getAttribute('r')).toBe('A2');
    const a2Text = a2.getElementsByTagName('is')[0]?.getElementsByTagName('t')[0]?.textContent ?? '';
    expect(a2Text).toMatch(/^\[姓名:[0-9a-f]{6}\]$/);

    // B2 held the ID number; likewise rewritten as an inline string in place.
    const b2 = cellByRef('B2');
    expect(b2.getAttribute('t')).toBe('inlineStr');
    expect(b2.getAttribute('s')).toBe('1');
    expect(b2.getAttribute('r')).toBe('B2');
    const b2Text = b2.getElementsByTagName('is')[0]?.getElementsByTagName('t')[0]?.textContent ?? '';
    expect(b2Text).toMatch(/^\[身分證:[0-9a-f]{6}\]$/);

    // A1 ("姓名") was never touched, so it still references the shared strings table.
    const a1 = cellByRef('A1');
    expect(a1.getAttribute('t')).toBe('s');
    expect(a1.getElementsByTagName('is').length).toBe(0);

    // The worksheet itself no longer shows any redacted original in cleartext.
    expect(sheet1Xml).not.toContain('A123456789');
    for (const item of items.filter((i) => i.active)) {
      expect(sheet1Xml).not.toContain(item.original);
    }
  });

  // Regression guard for a real leak found in review: redacted cells used to leave their
  // original value behind as an orphaned <si> entry in xl/sharedStrings.xml.
  it('leaves no original sensitive value anywhere in the output archive after redaction', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const originalDoc = await parseXlsx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits } = applyRedactions(originalDoc.text, items);
    const blob = await generateXlsx(originalDoc, edits);
    const newZip = await JSZip.loadAsync(await blob.arrayBuffer());

    for (const path of Object.keys(newZip.files)) {
      const entry = newZip.files[path];
      if (entry.dir) continue;
      const content = await entry.async('string');
      for (const item of items.filter((i) => i.active)) {
        expect(content, `${path} still contains original value ${JSON.stringify(item.original)}`).not.toContain(
          item.original,
        );
      }
    }
  });

  it('restores the redacted xlsx text back to the original, at text and regeneration level', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const originalDoc = await parseXlsx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generateXlsx(originalDoc, edits);
    const newFile = toXlsxFile(new Uint8Array(await blob.arrayBuffer()), 'redacted.xlsx');
    const newDoc = await parseXlsx(newFile);

    const restoreResult = restore(newDoc.text, mapping);
    expect(restoreResult.restoredText).toBe(originalDoc.text);
    expect(restoreResult.missingCodes).toEqual([]);

    const restoredBlob = await generateXlsx(newDoc, restoreResult.edits);
    const restoredFile = toXlsxFile(new Uint8Array(await restoredBlob.arrayBuffer()), 'restored.xlsx');
    const restoredDoc = await parseXlsx(restoredFile);
    expect(restoredDoc.text).toBe(originalDoc.text);
  });

  it('is idempotent: generating twice from the same LoadedDocument+edits yields the same text and does not mutate the handle', async () => {
    const bytes = await buildXlsx(SAMPLE_XLSX_SPEC);
    const file = toXlsxFile(bytes, 'sample.xlsx');
    const originalDoc = await parseXlsx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits } = applyRedactions(originalDoc.text, items);

    const blob1 = await generateXlsx(originalDoc, edits);
    const text1 = (await parseXlsx(toXlsxFile(new Uint8Array(await blob1.arrayBuffer()), 'a.xlsx'))).text;

    const blob2 = await generateXlsx(originalDoc, edits);
    const text2 = (await parseXlsx(toXlsxFile(new Uint8Array(await blob2.arrayBuffer()), 'b.xlsx'))).text;

    expect(text2).toBe(text1);

    // A fresh parse of the pristine, never-regenerated bytes should still read the
    // same original text, proving the handle's underlying zip/documents weren't mutated.
    const freshOriginal = await parseXlsx(toXlsxFile(bytes, 'sample.xlsx'));
    expect(freshOriginal.text).toBe(originalDoc.text);
  });

  it('reads multi-sheet workbooks in workbook.xml order', async () => {
    const spec: XlsxSpec = {
      sheets: [
        { name: 'First', rows: [[{ inline: 'AAA-only-in-sheet-one' }]] },
        { name: 'Second', rows: [[{ inline: 'BBB-only-in-sheet-two' }]] },
      ],
    };
    const bytes = await buildXlsx(spec);
    const doc = await parseXlsx(toXlsxFile(bytes, 'multi.xlsx'));

    expect(doc.text).toContain('AAA-only-in-sheet-one');
    expect(doc.text).toContain('BBB-only-in-sheet-two');
    expect(doc.text.indexOf('AAA-only-in-sheet-one')).toBeLessThan(doc.text.indexOf('BBB-only-in-sheet-two'));
  });

  it('parses a workbook that has no sharedStrings.xml (inline strings and numbers only)', async () => {
    const spec: XlsxSpec = {
      sheets: [{ name: 'S', rows: [[{ inline: '無共用字串測試' }, 42]] }],
    };
    const bytes = await buildXlsx(spec);
    const zip = await JSZip.loadAsync(bytes);
    zip.remove('xl/sharedStrings.xml');
    const strippedBytes = await zip.generateAsync({ type: 'uint8array' });

    const doc = await parseXlsx(toXlsxFile(strippedBytes, 'no-shared-strings.xlsx'));
    expect(doc.text).toContain('無共用字串測試');
  });

  it('rejects a zip that is not an Excel workbook (e.g. a docx file)', async () => {
    const bytes = readFileSync('tests/fixtures/sample.docx');
    const file = new File([new Uint8Array(bytes) as BlobPart], 'sample.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(parseXlsx(file)).rejects.toThrow(/Excel/);
  });
});
