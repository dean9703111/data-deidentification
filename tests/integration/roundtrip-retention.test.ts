import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detector';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { SUGGESTED_RETENTION } from '../helpers/retention-fixtures';
import { parseDocx, generateDocx } from '../../src/formats/docx';
import { parseXlsx, generateXlsx } from '../../src/formats/xlsx';
import { buildDocx, toFile, SAMPLE_DOCX_SPEC } from '../helpers/docx-builder';
import { buildXlsx, toXlsxFile, SAMPLE_XLSX_SPEC } from '../helpers/xlsx-builder';

const SUGGESTED = BUILTIN_PATTERNS.map((p) => ({ ...p, retention: SUGGESTED_RETENTION[p.id] }));

describe('round trip with partial retention', () => {
  it('docx: kept characters survive, restore gives back the original text', async () => {
    const doc = await parseDocx(toFile(await buildDocx(SAMPLE_DOCX_SPEC), 'sample.docx'));
    const items = detect(doc.text, SUGGESTED);
    expect(items.some((i) => i.head || i.tail)).toBe(true);
    const { edits, mapping } = applyRedactions(doc.text, items);
    const out = await parseDocx(toFile(new Uint8Array(await (await generateDocx(doc, edits)).arrayBuffer()), 'out.docx'));
    expect(out.text).toMatch(/A1\[身分證:[0-9a-f]{6}\]/);
    expect(out.text).not.toContain('A123456789');
    expect(restore(out.text, mapping).restoredText).toBe(doc.text);
  });

  it('xlsx: kept characters survive, restore gives back the original text', async () => {
    const doc = await parseXlsx(toXlsxFile(await buildXlsx(SAMPLE_XLSX_SPEC), 'sample.xlsx'));
    const items = detect(doc.text, SUGGESTED);
    const { edits, mapping } = applyRedactions(doc.text, items);
    const out = await parseXlsx(toXlsxFile(new Uint8Array(await (await generateXlsx(doc, edits)).arrayBuffer()), 'out.xlsx'));
    expect(out.text).toMatch(/台北市信義區\[地址:[0-9a-f]{6}\]/);
    expect(out.text).toMatch(/\[手機:[0-9a-f]{6}\]678/);
    expect(restore(out.text, mapping).restoredText).toBe(doc.text);
  });
});
