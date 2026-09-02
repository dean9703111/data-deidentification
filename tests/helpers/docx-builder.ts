import JSZip from 'jszip';

/**
 * Builds a minimal but valid .docx from paragraph descriptions.
 * Each paragraph is a list of runs; a run is a string placed in its own <w:t>,
 * so a value split across runs exercises cross-node replacement.
 */
export interface DocxSpec {
  paragraphs: string[][];
  /** Rows of cells; each cell is a list of runs. */
  table?: string[][][];
  header?: string[][];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function runs(list: string[]): string {
  return list.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
}

function paragraph(list: string[]): string {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs(list)}</w:p>`;
}

function table(rows: string[][][]): string {
  const trs = rows
    .map((cells) => `<w:tr>${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${paragraph(c)}</w:tc>`).join('')}</w:tr>`)
    .join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>${trs}</w:tbl>`;
}

export function buildDocumentXml(spec: DocxSpec): string {
  const body = spec.paragraphs.map(paragraph).join('') + (spec.table ? table(spec.table) : '');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

export async function buildDocx(spec: DocxSpec): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
${spec.header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${spec.header ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ''}
</Relationships>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`,
  );
  zip.file('word/document.xml', buildDocumentXml(spec));
  if (spec.header) {
    zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="${W}">${spec.header.map(paragraph).join('')}</w:hdr>`);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

export function toFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** The sample used by the docx round-trip tests. */
export const SAMPLE_DOCX_SPEC: DocxSpec = {
  header: [['機密文件 - 承辦人 陳大文']],
  paragraphs: [
    ['個案姓名：', '王小明', '先生（身分證字號 ', 'A1234', '56789', '），聯絡手機 0912-345-678。'],
    ['通訊地址：台北市信義區市府路45號8樓；Email：xiaoming.wang@example.com'],
    ['王小明表示其配偶林美玲女士亦同意。'],
  ],
  table: [
    [['項目'], ['內容']],
    [['緊急聯絡人'], ['歐陽志遠（', '0987654321', '）']],
  ],
};
