// Generates tests/fixtures/sample.docx, sample.xlsx and sample.pdf.
// Run: node scripts/make-fixtures.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocx, SAMPLE_DOCX_SPEC } from '../tests/helpers/docx-builder.ts';
import { sparseSubsetTtf } from '../src/formats/ttf-subset.ts';
import { buildXlsx, SAMPLE_XLSX_SPEC } from '../tests/helpers/xlsx-builder.ts';

const docx = await buildDocx(SAMPLE_DOCX_SPEC);
writeFileSync('tests/fixtures/sample.docx', docx);
writeFileSync('tests/fixtures/sample.xlsx', await buildXlsx(SAMPLE_XLSX_SPEC));

const font = new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'));
const lines = readFileSync('tests/fixtures/sample.txt', 'utf-8').split('\n');
const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const embedded = await pdf.embedFont(sparseSubsetTtf(font, lines.join('') + '0123456789'), { subset: false });
const page = pdf.addPage([595, 842]);
lines.forEach((line, i) => {
  if (line.trim()) page.drawText(line, { x: 40, y: 800 - i * 22, size: 11, font: embedded });
});
writeFileSync('tests/fixtures/sample.pdf', await pdf.save());
console.log('fixtures written: sample.docx, sample.xlsx, sample.pdf');
