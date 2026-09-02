import JSZip from 'jszip';
import type { Block, DocModel } from './docmodel.ts';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PAGE_WIDTH_TWIPS = 9026; // A4 minus 1" margins

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Splits text into runs the way Word does when scripts alternate (CJK vs Latin/digits get
 * different font hints), and occasionally splits a long Latin/digit token in two — which is
 * exactly what spell-check and manual edits leave behind in real files.
 */
function runs(text: string, opts: { bold?: boolean; size?: number } = {}, seed = 1): string {
  const segs = text.match(/[A-Za-z0-9@._+\-()#:/]+|[^A-Za-z0-9@._+\-()#:/]+/gu) ?? [text];
  let n = seed;
  const out: string[] = [];
  for (const seg of segs) {
    const latin = /^[A-Za-z0-9@._+\-()#:/]+$/.test(seg);
    n = (n * 9301 + 49297) % 233280;
    const pieces = latin && seg.length >= 8 && n / 233280 < 0.35 ? [seg.slice(0, Math.ceil(seg.length / 2)), seg.slice(Math.ceil(seg.length / 2))] : [seg];
    for (const p of pieces) {
      const rPr =
        `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size * 2}"/>` : ''}` +
        (latin ? '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:lang w:val="en-US"/>' : '<w:rFonts w:hint="eastAsia"/><w:lang w:eastAsia="zh-TW"/>') +
        '</w:rPr>';
      out.push(`<w:r>${rPr}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>`);
    }
  }
  return out.join('');
}

function para(text: string, style?: string, extra: { align?: string; bold?: boolean; indent?: boolean; size?: number } = {}, seed = 1): string {
  const pPr =
    `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}` +
    (extra.indent ? '<w:ind w:firstLine="480"/>' : '') +
    (extra.align ? `<w:jc w:val="${extra.align === 'right' ? 'right' : extra.align === 'center' ? 'center' : 'both'}"/>` : '') +
    '<w:spacing w:after="120"/></w:pPr>';
  return `<w:p>${pPr}${runs(text, { bold: extra.bold, size: extra.size }, seed)}</w:p>`;
}

function table(columns: { header: string; width: number }[], rows: string[][], seed: number): string {
  const total = columns.reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c) => Math.round((c.width / total) * PAGE_WIDTH_TWIPS));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const cell = (text: string, i: number, head: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : ''}</w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runs(text, { bold: head, size: 10 }, seed + i)}</w:p></w:tc>`;
  const headRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns.map((c, i) => cell(c.header, i, true)).join('')}</w:tr>`;
  const bodyRows = rows.map((r) => `<w:tr>${r.map((v, i) => cell(v, i, false)).join('')}</w:tr>`).join('');
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${PAGE_WIDTH_TWIPS}" w:type="dxa"/>` +
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/>' +
    '<w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/>' +
    '<w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/></w:tblBorders>' +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headRow}${bodyRows}</w:tbl><w:p/>`
  );
}

function renderBlock(b: Block, i: number): string {
  switch (b.type) {
    case 'title':
      return para(b.text, 'Title', { align: 'center', bold: true, size: 20 }, i);
    case 'subtitle':
      return para(b.text, undefined, { align: 'center', size: 11 }, i);
    case 'heading':
      return para(b.text, 'Heading1', { bold: true, size: 13 }, i);
    case 'para':
      return para(b.text, undefined, { align: b.align, bold: b.bold, indent: b.indent }, i);
    case 'kv':
      return b.rows.map(([k, v], j) => para(`${k}：${v}`, undefined, {}, i * 31 + j)).join('');
    case 'table':
      return table(b.columns, b.rows, i);
    case 'spacer':
      return '<w:p/>';
    case 'pageBreak':
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
}

export async function renderDocx(doc: DocModel): Promise<Uint8Array> {
  const body = doc.blocks.map(renderBlock).join('');
  const sectPr =
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${sectPr}</w:body></w:document>`;

  const headerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="${W}"><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr>` +
    `${runs(doc.header, { size: 9 }, 7)}</w:p></w:hdr>`;
  const footerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>` +
    `${runs(`${doc.footer}　第 `, { size: 9 }, 8)}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>` +
    `${runs(' 頁，共 ', { size: 9 }, 9)}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>${runs(' 頁', { size: 9 }, 10)}</w:p></w:ftr>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微軟正黑體"/><w:sz w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(doc.title)}</dc:title><dc:creator>example</dc:creator></cp:coreProperties>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>
<Relationship Id="rIdH" Type="${R}/header" Target="header1.xml"/>
<Relationship Id="rIdF" Type="${R}/footer" Target="footer1.xml"/>
</Relationships>`,
  );
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/header1.xml', headerXml);
  zip.file('word/footer1.xml', footerXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
