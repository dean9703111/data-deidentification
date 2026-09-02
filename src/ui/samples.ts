import { button, el, toast } from './components';

export interface Sample {
  file: string;
  /** Display / download name (Chinese) for the ASCII-named asset. */
  name: string;
  format: string;
  description: string;
}

const BASE = `${import.meta.env.BASE_URL}samples/`;

export const SAMPLES: Sample[] = [
  { file: 'contract.docx', name: '委外服務契約書.docx', format: 'DOCX', description: '4 頁契約：立契約書人、十二條條款、附件表格、簽署頁' },
  { file: 'contract.pdf', name: '委外服務契約書.pdf', format: 'PDF', description: '同一份契約的 PDF 版本（含頁首頁尾與表格）' },
  { file: 'quotation.docx', name: '報價單.docx', format: 'DOCX', description: '4 頁報價單：客戶資料、20 項明細、聯絡窗口、簽回頁' },
  { file: 'quotation.pdf', name: '報價單.pdf', format: 'PDF', description: '同一份報價單的 PDF 版本' },
  { file: 'customers.xlsx', name: '客戶資料.xlsx', format: 'XLSX', description: '60 筆客戶＋聯絡紀錄＋業務窗口三個工作表' },
  { file: 'support-email.txt', name: '客服信件.txt', format: 'TXT', description: '客服回覆信與引用的原始來信' },
  { file: 'meeting-notes.md', name: '專案會議紀錄.md', format: 'MD', description: 'Markdown 會議紀錄：出席者、決議表格、待辦' },
];

export const RESTORE_SAMPLE = {
  doc: { file: 'contract.deid.docx', name: '委外服務契約書.deid.docx', format: 'DOCX', description: '已去識別化的契約書' },
  csv: { file: 'contract.mapping.csv', name: '委外服務契約書.mapping.csv', format: 'CSV', description: '對應的編碼表' },
};

export function sampleUrl(file: string): string {
  return BASE + file;
}

/** Fetches a bundled sample (same-origin static asset) as a File carrying its display name. */
export async function fetchSample(s: Pick<Sample, 'file' | 'name'>): Promise<File> {
  const res = await fetch(sampleUrl(s.file));
  if (!res.ok) throw new Error(`無法載入範例 ${s.name}`);
  return new File([await res.blob()], s.name);
}

export function sampleCard(s: Sample, onLoad?: (file: File) => void): HTMLElement {
  return el(
    'div',
    { class: 'sample-card' },
    el('div', { class: 'sample-main' },
      el('div', { class: 'sample-name' }, el('span', { class: 'badge' }, s.format), ' ', s.name),
      el('div', { class: 'muted small' }, s.description),
    ),
    el('div', { class: 'sample-actions' },
      onLoad
        ? button('載入體驗', () => {
            fetchSample(s).then(onLoad).catch((e: Error) => toast(e.message, 'error'));
          }, 'btn btn-small btn-primary')
        : null,
      el('a', { class: 'btn btn-small', href: sampleUrl(s.file), download: s.name }, '下載'),
    ),
  );
}

export function samplesSection(title: string, samples: Sample[], onLoad?: (file: File) => void, extra?: Node): HTMLElement {
  return el(
    'section',
    { class: 'samples' },
    el('h3', {}, title),
    el('p', { class: 'muted small' }, '所有範例皆為程式產生的虛構資料（姓名、公司、地址、電話、證號均非真人），可放心試用；「載入體驗」直接把檔案送進本頁處理，「下載」則取得原始檔案。'),
    el('div', { class: 'sample-grid' }, ...samples.map((s) => sampleCard(s, onLoad))),
    extra ?? null,
  );
}
