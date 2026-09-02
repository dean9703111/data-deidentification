import JSZip from 'jszip';

/**
 * Builds a minimal but valid .xlsx. Cell values: strings become shared strings (duplicates
 * share one entry, like Excel does), `{ inline: '...' }` becomes an inline string,
 * `{ rich: ['a','b'] }` a rich-text shared string, numbers numeric cells.
 */
export type CellSpec = string | number | { inline: string } | { rich: string[] };

export interface XlsxSpec {
  sheets: { name: string; rows: CellSpec[][]; colWidths?: number[] }[];
  /** When true only the first row of each sheet is bold (s="1"); other cells use s="0". */
  headerOnlyBold?: boolean;
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colName(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export async function buildXlsx(spec: XlsxSpec): Promise<Uint8Array> {
  const shared: string[] = [];
  const sharedXml: string[] = [];
  const sharedIndex = (key: string, xml: string) => {
    let i = shared.indexOf(key);
    if (i < 0) {
      i = shared.length;
      shared.push(key);
      sharedXml.push(xml);
    }
    return i;
  };

  const sheetXmls = spec.sheets.map(({ rows }) => {
    const rowXml = rows
      .map((cells, r) => {
        const cs = cells
          .map((v, c) => {
            const ref = `${colName(c)}${r + 1}`;
            if (typeof v === 'number') return `<c r="${ref}" s="1"><v>${v}</v></c>`;
            if (typeof v === 'string') {
              const i = sharedIndex(`s:${v}`, `<si><t xml:space="preserve">${esc(v)}</t></si>`);
              return `<c r="${ref}" t="s" s="1"><v>${i}</v></c>`;
            }
            if ('inline' in v) return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(v.inline)}</t></is></c>`;
            const i = sharedIndex(`r:${v.rich.join(' ')}`, `<si>${v.rich.map((p) => `<r><rPr><b/></rPr><t xml:space="preserve">${esc(p)}</t></r>`).join('')}</si>`);
            return `<c r="${ref}" t="s" s="1"><v>${i}</v></c>`;
          })
          .join('');
        return `<row r="${r + 1}">${cs}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN}"><sheetData>${rowXml}</sheetData></worksheet>`;
  });

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${spec.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${spec.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${spec.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${spec.sheets.length + 1}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId${spec.sheets.length + 2}" Type="${REL}/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
  );
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${MAIN}" count="${shared.length}" uniqueCount="${shared.length}">${sharedXml.join('')}</sst>`,
  );
  sheetXmls.forEach((xml, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xml));
  return zip.generateAsync({ type: 'uint8array' });
}

export function toXlsxFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Sample used by the xlsx round-trip tests: 王小明 appears in two cells that share one string entry. */
export const SAMPLE_XLSX_SPEC: XlsxSpec = {
  sheets: [
    {
      name: '個案清單',
      rows: [
        ['姓名', '身分證字號', '手機', '地址', '備註'],
        ['王小明', 'A123456789', '0912-345-678', '台北市信義區市府路45號8樓', { inline: 'Email: xiaoming.wang@example.com' }],
        ['林美玲', 'B223456782', 912345678, '新北市板橋區文化路一段188巷3號之2', { rich: ['聯絡人：', '歐陽志遠'] }],
        ['王小明', 'A123456789', '0987654321', '臺中市西屯區台灣大道三段99號', '同上'],
      ],
    },
    {
      name: '承辦',
      rows: [
        ['承辦社工', '陳大文'],
        ['市話', '(02)2712-3456'],
      ],
    },
  ],
};
