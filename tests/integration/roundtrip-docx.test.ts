import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { parseMarkers } from '../../src/core/codes';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { parseDocx, generateDocx } from '../../src/formats/docx';
import { buildDocx, toFile, SAMPLE_DOCX_SPEC } from '../helpers/docx-builder';

function countTag(xml: string, tag: string): number {
  const re = new RegExp(`<${tag}(?:[\\s>/]|$)`, 'g');
  return (xml.match(re) ?? []).length;
}

describe('docx round trip', () => {
  it('parses paragraph, table, and header text out of the sample docx', async () => {
    const bytes = await buildDocx(SAMPLE_DOCX_SPEC);
    const file = toFile(bytes, 'sample.docx');
    const doc = await parseDocx(file);

    expect(doc.text).toContain('王小明');
    expect(doc.text).toContain('A123456789');
    expect(doc.text).toContain('歐陽志遠（0987654321）');
    expect(doc.text).toContain('陳大文');
  });

  it('redacts every active item, regenerates the docx, and leaves no trace of the split ID', async () => {
    const bytes = await buildDocx(SAMPLE_DOCX_SPEC);
    const file = toFile(bytes, 'sample.docx');
    const originalDoc = await parseDocx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);

    const blob = await generateDocx(originalDoc, edits);
    const newFile = toFile(new Uint8Array(await blob.arrayBuffer()), 'redacted.docx');
    const newDoc = await parseDocx(newFile);

    const markerCodes = parseMarkers(newDoc.text).map((m) => m.code);
    expect(new Set(markerCodes)).toEqual(new Set(mapping.map((m) => m.code)));

    for (const item of items.filter((i) => i.active)) {
      expect(newDoc.text.includes(item.original)).toBe(false);
    }
    expect(newDoc.text).not.toContain('A123456789');

    // Confirm at the raw XML level that the split ID run is fully gone: the first run
    // now holds the marker and the second run (formerly "56789") is empty.
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).not.toContain('A1234');
    expect(docXml).not.toContain('56789');
    expect(docXml).not.toContain('A123456789');
    expect(docXml).toMatch(
      /<w:t[^>]*>\[身分證:[0-9a-f]{6}\]<\/w:t>\s*<\/w:r>\s*<w:r>[^<]*<w:rPr>[\s\S]*?<\/w:rPr>\s*<w:t[^>]*\/>/,
    );
  });

  it('preserves docx structure: styles.xml is byte-identical and element counts/bold runs match', async () => {
    const bytes = await buildDocx(SAMPLE_DOCX_SPEC);
    const file = toFile(bytes, 'sample.docx');
    const originalDoc = await parseDocx(file);

    const originalZip = await JSZip.loadAsync(bytes);
    const originalStyles = await originalZip.file('word/styles.xml')!.async('string');
    const originalDocXml = await originalZip.file('word/document.xml')!.async('string');

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits } = applyRedactions(originalDoc.text, items);
    const blob = await generateDocx(originalDoc, edits);

    const newZip = await JSZip.loadAsync(await blob.arrayBuffer());
    const newStyles = await newZip.file('word/styles.xml')!.async('string');
    const newDocXml = await newZip.file('word/document.xml')!.async('string');

    expect(newStyles).toBe(originalStyles);

    for (const tag of ['w:tbl', 'w:tr', 'w:tc', 'w:p', 'w:r']) {
      expect(countTag(newDocXml, tag)).toBe(countTag(originalDocXml, tag));
    }
    expect(countTag(newDocXml, 'w:b/')).toBe(countTag(originalDocXml, 'w:b/'));

    const newHeaderXml = await newZip.file('word/header1.xml')!.async('string');
    expect(newHeaderXml).not.toContain('陳大文');
    expect(newHeaderXml).toMatch(/\[姓名:[0-9a-f]{6}\]/);
  });

  it('restores the redacted docx text back to the original via restorer.restore, at both the text and docx-regeneration level', async () => {
    const bytes = await buildDocx(SAMPLE_DOCX_SPEC);
    const file = toFile(bytes, 'sample.docx');
    const originalDoc = await parseDocx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generateDocx(originalDoc, edits);
    const newFile = toFile(new Uint8Array(await blob.arrayBuffer()), 'redacted.docx');
    const newDoc = await parseDocx(newFile);

    const restoreResult = restore(newDoc.text, mapping);
    expect(restoreResult.restoredText).toBe(originalDoc.text);
    expect(restoreResult.missingCodes).toEqual([]);

    const restoredBlob = await generateDocx(newDoc, restoreResult.edits);
    const restoredFile = toFile(new Uint8Array(await restoredBlob.arrayBuffer()), 'restored.docx');
    const restoredDoc = await parseDocx(restoredFile);
    expect(restoredDoc.text).toBe(originalDoc.text);
  });

  it('is idempotent: generating twice from the same LoadedDocument+edits yields the same text and does not mutate the handle', async () => {
    const bytes = await buildDocx(SAMPLE_DOCX_SPEC);
    const file = toFile(bytes, 'sample.docx');
    const originalDoc = await parseDocx(file);

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const { edits } = applyRedactions(originalDoc.text, items);

    const blob1 = await generateDocx(originalDoc, edits);
    const text1 = (await parseDocx(toFile(new Uint8Array(await blob1.arrayBuffer()), 'a.docx'))).text;

    const blob2 = await generateDocx(originalDoc, edits);
    const text2 = (await parseDocx(toFile(new Uint8Array(await blob2.arrayBuffer()), 'b.docx'))).text;

    expect(text2).toBe(text1);

    // A third parse of the pristine, never-regenerated original should still read the
    // same original text, proving the handle's underlying zip/doc wasn't mutated in place.
    const freshOriginal = await parseDocx(toFile(bytes, 'sample.docx'));
    expect(freshOriginal.text).toBe(originalDoc.text);
  });

  it('detects and replaces a phone number split across three runs with exactly one marker', async () => {
    const bytes = await buildDocx({
      paragraphs: [['聯絡電話：', '09', '1234', '5678', '。']],
    });
    const file = toFile(bytes, 'split-phone.docx');
    const originalDoc = await parseDocx(file);
    expect(originalDoc.text).toContain('0912345678');

    const items = detect(originalDoc.text, BUILTIN_PATTERNS);
    const phoneItems = items.filter((i) => i.category === '手機' && i.original === '0912345678');
    expect(phoneItems.length).toBe(1);

    const { edits, mapping } = applyRedactions(originalDoc.text, items);
    const blob = await generateDocx(originalDoc, edits);
    const newDoc = await parseDocx(toFile(new Uint8Array(await blob.arrayBuffer()), 'out.docx'));

    expect(newDoc.text).not.toContain('0912345678');
    const markers = parseMarkers(newDoc.text).filter((m) => m.category === '手機');
    expect(markers.length).toBe(1);
    expect(markers[0].code).toBe(mapping.find((m) => m.original === '0912345678')!.code);
  });
});
