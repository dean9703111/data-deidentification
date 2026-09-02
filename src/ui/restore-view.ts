import type { LoadedDocument, MappingEntry } from '../core/types';
import { parseMapping } from '../core/csv';
import { restore, type RestoreResult } from '../core/restorer';
import { ACCEPT_ATTR, generateDocument, outputFileName, parseDocument } from '../formats';
import { button, clear, downloadBlob, dropZone, el, toast } from './components';
import { renderDocumentPreview, type Decoration } from './preview';

interface State {
  doc: LoadedDocument | null;
  mapping: MappingEntry[] | null;
  result: RestoreResult | null;
}

const state: State = { doc: null, mapping: null, result: null };

export function createRestoreView(): HTMLElement {
  const root = el('section', { class: 'view restore-view' });
  render(root);
  return root;
}

function render(root: HTMLElement): void {
  clear(root);
  root.append(
    el('h2', {}, '還原文件'),
    el('p', { class: 'muted' }, '上傳去識別化後的文件與對應的編碼表 (CSV)，系統會將 [類別:編碼] 標記換回原始內容。'),
    el('div', { class: 'restore-inputs' },
      el('div', { class: 'restore-slot' },
        el('h3', {}, '1. 去識別化文件'),
        state.doc ? fileChip(state.doc.fileName, () => { state.doc = null; state.result = null; render(root); }) : dropZone({ accept: ACCEPT_ATTR, label: '選擇去識別化文件', hint: '.pdf .docx .xlsx .txt .md', onFiles: (f) => void loadDoc(f[0], root) }),
      ),
      el('div', { class: 'restore-slot' },
        el('h3', {}, '2. 編碼表 (CSV)'),
        state.mapping ? fileChip(`編碼表：${state.mapping.length} 筆`, () => { state.mapping = null; state.result = null; render(root); }) : dropZone({ accept: '.csv,text/csv', label: '選擇編碼表 CSV', hint: '*.mapping.csv', onFiles: (f) => void loadCsv(f[0], root) }),
      ),
    ),
  );
  if (state.result) root.append(renderResult(root));
}

function fileChip(label: string, onRemove: () => void): HTMLElement {
  return el('div', { class: 'file-chip' }, el('span', {}, label), button('移除', onRemove, 'btn btn-small btn-ghost'));
}

async function loadDoc(file: File, root: HTMLElement): Promise<void> {
  try {
    state.doc = await parseDocument(file);
    state.result = null;
    tryRestore();
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

async function loadCsv(file: File, root: HTMLElement): Promise<void> {
  try {
    const { entries, errors } = parseMapping(await file.text());
    if (errors.length) {
      toast(`編碼表格式錯誤：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}`, 'error', 9000);
      return;
    }
    state.mapping = entries;
    state.result = null;
    tryRestore();
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function tryRestore(): void {
  if (!state.doc || !state.mapping) return;
  state.result = restore(state.doc.text, state.mapping);
  if (state.result.missingCodes.length) toast(`有 ${state.result.missingCodes.length} 個編碼在編碼表中找不到`, 'error', 7000);
  else toast(`已還原 ${state.result.restoredCount} 筆`, 'success');
}

function renderResult(root: HTMLElement): HTMLElement {
  const r = state.result!;
  const doc = state.doc!;
  const preview = el('div', { class: 'preview' });
  const decorations: Decoration[] = r.edits.map((e) => ({
    start: e.start,
    end: e.end,
    kind: 'restored',
    label: e.replacement,
    className: 'mark-restored',
    tip: `已由標記 ${doc.text.slice(e.start, e.end)} 還原`,
  }));
  renderDocumentPreview(preview, doc, decorations);

  return el(
    'div',
    { class: 'restore-result' },
    el('div', { class: 'toolbar' },
      el('div', {}, el('strong', {}, `已還原 ${r.restoredCount} 筆`), r.missingCodes.length ? el('span', { class: 'warn' }, `，${r.missingCodes.length} 個編碼無法還原`) : null),
      button('下載還原文件', () => void download(root), 'btn btn-primary'),
    ),
    r.missingCodes.length
      ? el('div', { class: 'notice notice-warn' }, '以下編碼在編碼表中找不到，已保留原標記：', el('div', { class: 'code-list' }, ...r.missingCodes.map((c) => el('code', {}, c))))
      : null,
    el('h3', {}, '還原預覽'),
    preview,
  );
}

async function download(_root: HTMLElement): Promise<void> {
  const doc = state.doc!;
  const r = state.result!;
  try {
    toast('產生檔案中…', 'info', 2000);
    const blob = await generateDocument(doc, r.edits);
    downloadBlob(blob, outputFileName(doc.fileName.replace(/\.deid(?=\.[^.]+$)/, ''), 'restored'));
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}
