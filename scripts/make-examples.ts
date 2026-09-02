// Generates the scenario example files under examples/ (see examples/README.md).
// Run: npm run examples
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { PDFDocument } from 'pdf-lib';
import { buildXlsx } from '../tests/helpers/xlsx-builder.ts';
import { contract, customers, meetingNotes, quotation, supportEmail } from './lib/documents.ts';
import { renderDocx } from './lib/render-docx.ts';
import { renderPdf } from './lib/render-pdf.ts';
import { detect } from '../src/core/detector.ts';
import { BUILTIN_PATTERNS } from '../src/core/patterns.ts';
import { applyRedactions } from '../src/core/redactor.ts';
import { serializeMapping } from '../src/core/csv.ts';
import { parseDocx, generateDocx } from '../src/formats/docx.ts';

// The docx pipeline needs a DOM; borrow jsdom's for this script.
const dom = new JSDOM('');
Object.assign(globalThis, { DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer });

const ROOT = 'examples';
rmSync(ROOT, { recursive: true, force: true });
const dir = (name: string) => {
  const p = join(ROOT, name);
  mkdirSync(p, { recursive: true });
  return p;
};
const write = (p: string, data: string | Uint8Array) => writeFileSync(p, data);
const font = new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'));

// 情境 1：核心流程 — 真實案例（合約書 / 報價單 各 4 頁 Word+PDF、客戶資料 Excel 60 筆、信件、會議紀錄）
const contractDoc = contract();
const quotationDoc = quotation();
const contractDocx = await renderDocx(contractDoc);
{
  const d = dir('01-核心流程');
  write(join(d, '委外服務契約書.docx'), contractDocx);
  write(join(d, '委外服務契約書.pdf'), await renderPdf(contractDoc, font));
  write(join(d, '報價單.docx'), await renderDocx(quotationDoc));
  write(join(d, '報價單.pdf'), await renderPdf(quotationDoc, font));
  write(join(d, '客戶資料.xlsx'), await buildXlsx(customers()));
  write(join(d, '客服信件.txt'), supportEmail());
  write(join(d, '專案會議紀錄.md'), meetingNotes());
}

// 情境 2：人工調整 — 含誤判（高鐵站）與漏抓（罕見姓氏、病歷號）
{
  const d = dir('02-人工調整');
  write(
    join(d, '人工調整範例.txt'),
    `訪視紀錄

案主禚小華（病歷號 MRN-2024-00123）於上午抵達高鐵站的服務台，由社工王小明接待。
案主聯絡手機 0933-111-222，居住於高雄市苓雅區四維三路2號。

【操作提示】
1. 「高鐵站」會被姓名規則誤判 → 在右側清單按「取消」。
2. 「禚小華」因姓氏罕見未被偵測 → 在預覽中圈選後選擇類別「姓名」新增。
3. 「MRN-2024-00123」為病歷號 → 圈選後選擇類別「識別碼」新增（或到「偵測規則」新增自訂規則 MRN-\\d{4}-\\d{5}）。
`,
  );
}

// 情境 3：還原 — 由實際管線產出的成對檔案（Word 合約書 + 客服信件），外加缺列與格式錯誤的 CSV
{
  const d = dir('03-還原');
  const file = new File([contractDocx as BlobPart], '委外服務契約書.docx');
  const doc = await parseDocx(file);
  const items = detect(doc.text, BUILTIN_PATTERNS);
  const { edits, mapping } = applyRedactions(doc.text, items);
  const blob = await generateDocx(doc, edits);
  write(join(d, '委外服務契約書.deid.docx'), new Uint8Array(await blob.arrayBuffer()));
  write(join(d, '委外服務契約書.mapping.csv'), serializeMapping(mapping));
  write(join(d, '委外服務契約書.mapping.缺一列.csv'), serializeMapping(mapping.slice(1)));
  write(join(d, '格式錯誤.mapping.csv'), '﻿code,original\r\n' + mapping.map((m) => `${m.code},${m.original}`).join('\r\n') + '\r\n');
  write(join(d, '編碼重複.mapping.csv'), serializeMapping([...mapping, mapping[0]]));

  const mail = supportEmail();
  const mailItems = detect(mail, BUILTIN_PATTERNS);
  const mailRes = applyRedactions(mail, mailItems);
  write(join(d, '客服信件.deid.txt'), mailRes.redactedText);
  write(join(d, '客服信件.mapping.csv'), serializeMapping(mailRes.mapping));
}

// 情境 4：偵測規則 — 自訂識別碼（客戶編號、統一編號、病歷號）與停用手機規則
{
  const d = dir('04-偵測規則');
  write(
    join(d, '自訂規則範例.txt'),
    `人事異動通知

承辦人員 EMP-004521（陳大文）已於 2026-09-01 到職，聯絡手機 0912-345-678。
備援人員 EMP-000132（林美玲），聯絡手機 0987-654-321。
病歷號 MRN-2024-00123 與 MRN-2025-00456 之案件移交完成。
客戶 CUST-10008（統一編號 04595257，嘉宏資訊股份有限公司）之合約已歸檔。

【操作提示】
1. 先直接上傳：手機、統一編號、公司名稱會被內建規則偵測；EMP-/MRN-/CUST- 編號不會。
2. 到「偵測規則」停用「手機號碼」，並新增自訂規則（類別皆為「識別碼」）：
   - 員工編號　EMP-\\d{6}
   - 病歷號　　MRN-\\d{4}-\\d{5}
   - 客戶編號　CUST-\\d{5}
3. 回到「去識別化」按「重新偵測」：編號被標記、手機不再被標記。
4. 用同樣的規則處理 01-核心流程/客戶資料.xlsx，可看到「客戶編號」整欄被標記（「統一編號」與「公司」欄位本來就會被內建規則標記）。
5. 重新整理頁面，規則設定仍保留。
`,
  );
}

// 情境 6：格式與邊界
{
  const d = dir('06-格式與邊界');
  const blank = await PDFDocument.create();
  blank.addPage([595, 842]);
  write(join(d, '掃描型無文字層.pdf'), await blank.save());
  write(join(d, '不支援的格式.json'), '{ "name": "王小明", "id": "A123456789" }\n');
  write(
    join(d, '原文含標記樣式.txt'),
    `本契約第 3 條引用之範本編號為 [姓名:abcdef]，此為原文既有文字，非去識別化標記。
簽署人：王小明（0912-345-678）
`,
  );
  write(
    join(d, '如何產生超大檔案.md'),
    `# 超過 20 MB 上限的測試檔

檔案太大不放進版本庫，請自行產生：

\`\`\`bash
# macOS / Linux：產生 25 MB 的文字檔
head -c 26214400 /dev/zero | tr '\\0' 'A' > 超過上限.txt
\`\`\`

上傳後預期看到「檔案超過 20 MB 上限」的錯誤提示。
`,
  );
}

// 網頁與 README 的「體驗範例」：同一批檔案以 ASCII 檔名放進 public/samples/（隨站台部署）
{
  const d = 'public/samples';
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  write(join(d, 'contract.docx'), contractDocx);
  write(join(d, 'contract.pdf'), await renderPdf(contractDoc, font));
  write(join(d, 'quotation.docx'), await renderDocx(quotationDoc));
  write(join(d, 'quotation.pdf'), await renderPdf(quotationDoc, font));
  write(join(d, 'customers.xlsx'), await buildXlsx(customers()));
  write(join(d, 'support-email.txt'), supportEmail());
  write(join(d, 'meeting-notes.md'), meetingNotes());
  const file = new File([contractDocx as BlobPart], '委外服務契約書.docx');
  const doc = await parseDocx(file);
  const items = detect(doc.text, BUILTIN_PATTERNS);
  const { edits, mapping } = applyRedactions(doc.text, items);
  write(join(d, 'contract.deid.docx'), new Uint8Array(await (await generateDocx(doc, edits)).arrayBuffer()));
  write(join(d, 'contract.mapping.csv'), serializeMapping(mapping));
}

console.log('examples written under', ROOT, 'and public/samples');
