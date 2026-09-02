import { button, el, toast } from './components';

export interface Sample {
  file: string;
  /** Display / download name (Chinese) for the ASCII-named asset. */
  name: string;
  format: string;
  description: string;
}

const BASE = `${import.meta.env.BASE_URL}samples/`;

/** One sample per format, shown as a single compact row on the upload screen. */
export const SAMPLES: Sample[] = [
  { file: 'contract.docx', name: '委外服務契約書.docx', format: 'Word', description: '4 頁契約，含表格與頁首頁尾' },
  { file: 'quotation.pdf', name: '報價單.pdf', format: 'PDF', description: '3 頁報價單，跨頁明細表' },
  { file: 'customers.xlsx', name: '客戶資料.xlsx', format: 'Excel', description: '60 筆客戶，三個工作表' },
  { file: 'meeting-notes.md', name: '專案會議紀錄.md', format: 'Markdown', description: '出席者、決議、待辦' },
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
        ? button('載入', () => {
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
    el('div', { class: 'samples-head' },
      el('h3', {}, title),
      el('span', { class: 'muted small' }, '皆為程式產生的虛構資料；「載入」直接送進本頁處理，「下載」取得原始檔'),
    ),
    el('div', { class: 'sample-row' }, ...samples.map((s) => sampleCard(s, onLoad))),
    extra ?? null,
  );
}
