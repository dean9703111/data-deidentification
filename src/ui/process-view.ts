import type { Category, LoadedDocument, RedactionItem } from '../core/types';
import { CATEGORIES } from '../core/types';
import { addManualItem, detect, toggleItem } from '../core/detector';
import { applyRedactions } from '../core/redactor';
import { buildMarker, parseMarkers } from '../core/codes';
import { maskDisplay } from '../core/mask';
import { serializeMapping } from '../core/csv';
import { getEffectivePatterns } from '../core/pattern-store';
import { ACCEPT_ATTR, formatLimitations, generateDocument, mappingFileName, outputFileName, parseDocument } from '../formats';
import { button, clear, downloadBlob, dropZone, el, toast } from './components';
import { renderDocumentPreview, type Decoration } from './preview';
import { buildArchive } from '../formats/batch';

export const MAX_FILES = 10;

/** One uploaded (or pasted) document and everything the user has done to it. */
interface DocState {
  doc: LoadedDocument;
  items: RedactionItem[];
  used: Set<string>;
  downloadedDoc: boolean;
  downloadedCsv: boolean;
}

interface State {
  docs: DocState[];
  /** Index into `docs` of the document shown in the preview. */
  active: number;
  /** Preview shows the real `[類別:編碼]` output marker instead of the friendly mask. */
  showMarkers: boolean;
  /** Ignore the document layout (Word/Excel/PDF) and preview as plain text. */
  plainView: boolean;
  /** Categories switched off from the legend (applies to every document). */
  disabledCategories: Set<Category>;
  /** The detection list is collapsed by default. */
  showList: boolean;
}

const state: State = {
  docs: [],
  active: 0,
  showMarkers: false,
  plainView: false,
  disabledCategories: new Set(),
  showList: false,
};

const current = (): DocState => state.docs[state.active];

function markDirty(d: DocState): void {
  d.downloadedDoc = false;
  d.downloadedCsv = false;
}

function tooltipFor(it: RedactionItem): string {
  return `${it.category}｜原文：${it.original}｜輸出標記：${buildMarker(it.category, it.code)}${it.origin === 'manual' ? '｜手動新增' : ''}`;
}

function setCategoryEnabled(category: Category, enabled: boolean): void {
  if (enabled) state.disabledCategories.delete(category);
  else state.disabledCategories.add(category);
  for (const d of state.docs) {
    for (const it of d.items) {
      if (it.category !== category || it.active === enabled) continue;
      try {
        toggleItem(d.items, it.id);
      } catch {
        // re-enabling an item that now overlaps a manual one: leave it cancelled
      }
    }
    markDirty(d);
  }
}

/** Newly detected items honour the categories switched off in the legend. */
function applyDisabledCategories(d: DocState): void {
  for (const it of d.items) if (state.disabledCategories.has(it.category)) it.active = false;
}

export function hasUnsavedResults(): boolean {
  return state.docs.some((d) => d.items.some((it) => it.active) && !(d.downloadedDoc && d.downloadedCsv));
}

export function createProcessView(): HTMLElement {
  const root = el('section', { class: 'view process-view' });
  render(root);
  return root;
}

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------
async function loadFiles(files: File[], root: HTMLElement): Promise<void> {
  const room = MAX_FILES - state.docs.length;
  if (files.length > room) {
    toast(`一次最多處理 ${MAX_FILES} 個檔案（目前已有 ${state.docs.length} 個，只能再加入 ${room} 個）`, 'error', 7000);
    files = files.slice(0, Math.max(0, room));
    if (files.length === 0) return;
  }
  let loaded = 0;
  let firstNew = -1;
  for (const file of files) {
    try {
      const doc = await parseDocument(file);
      const used = new Set<string>();
      const d: DocState = { doc, items: detect(doc.text, getEffectivePatterns(), used), used, downloadedDoc: false, downloadedCsv: false };
      applyDisabledCategories(d);
      state.docs.push(d);
      if (firstNew < 0) firstNew = state.docs.length - 1;
      loaded++;
      if (parseMarkers(doc.text).length > 0) {
        toast(`${file.name}：原文中已存在形如 [類別:編碼] 的文字，可能與去識別化標記混淆。`, 'error', 8000);
      }
    } catch (e) {
      toast(`${file.name}：${(e as Error).message}`, 'error', 7000);
    }
  }
  if (loaded === 0) return;
  state.active = firstNew;
  const total = state.docs.reduce((n, d) => n + d.items.length, 0);
  toast(loaded === 1 ? `偵測到 ${current().items.length} 筆敏感資訊` : `已載入 ${loaded} 個檔案，共偵測到 ${total} 筆敏感資訊`, 'success');
  if (current().items.length === 0) toast('此檔案未偵測到敏感資訊。你仍可在預覽中圈選文字手動新增。', 'info', 6000);
  render(root);
}

function redetect(root: HTMLElement): void {
  const d = current();
  const manual = d.items.filter((it) => it.origin === 'manual');
  const fresh = detect(d.doc.text, getEffectivePatterns(), d.used).filter((a) => !manual.some((m) => m.active && a.start < m.end && a.end > m.start));
  d.items = [...manual, ...fresh].sort((a, b) => a.start - b.start);
  applyDisabledCategories(d);
  markDirty(d);
  toast(`重新偵測完成：自動 ${fresh.length} 筆、手動 ${manual.length} 筆`, 'success');
  render(root);
}

function removeDoc(index: number, root: HTMLElement): void {
  const d = state.docs[index];
  if (d.items.some((it) => it.active) && !(d.downloadedDoc && d.downloadedCsv) && !confirm(`「${d.doc.fileName}」尚未下載去識別化結果與編碼表，確定要移除嗎？`)) return;
  state.docs.splice(index, 1);
  state.active = Math.min(state.active, Math.max(0, state.docs.length - 1));
  render(root);
}

function resetAll(root: HTMLElement): void {
  if (hasUnsavedResults() && !confirm('尚有檔案未下載去識別化結果與編碼表，確定要全部清除嗎？')) return;
  state.docs = [];
  state.active = 0;
  render(root);
}

// ---------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------
function render(root: HTMLElement): void {
  clear(root);
  if (state.docs.length === 0) {
    root.append(
      el('h2', {}, '上傳文件'),
      el('p', { class: 'muted' }, `支援 PDF（含文字層）、Word (.docx)、Excel (.xlsx)、TXT、Markdown；可一次選擇多個檔案（最多 ${MAX_FILES} 個、格式可混合），單檔 20 MB 以內。所有處理皆在瀏覽器內完成，文件不會離開你的電腦。`),
      dropZone({
        accept: ACCEPT_ATTR,
        multiple: true,
        label: '拖曳一或多個檔案到這裡，或點擊選擇檔案',
        hint: `.pdf .docx .xlsx .txt .md ・ 最多 ${MAX_FILES} 個`,
        onFiles: (files) => void loadFiles(files, root),
      }),
      renderPasteBox(root),
    );
    return;
  }
  root.append(renderToolbar(root), renderWorkspace(root));
}

function renderPasteBox(root: HTMLElement): HTMLElement {
  const area = el('textarea', { class: 'input paste-area', rows: '6', placeholder: '或直接把文字貼在這裡（例如信件、對話紀錄、報表內容），再按「開始去識別化」' }) as HTMLTextAreaElement;
  const go = () => {
    const text = area.value;
    if (!text.trim()) {
      toast('請先貼上文字', 'error');
      return;
    }
    const n = state.docs.filter((d) => d.doc.fileName.startsWith('貼上的文字')).length;
    void loadFiles([new File([text], n === 0 ? '貼上的文字.txt' : `貼上的文字-${n + 1}.txt`, { type: 'text/plain' })], root);
  };
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go();
  });
  return el(
    'div',
    { class: 'paste-box' },
    el('div', { class: 'paste-divider' }, el('span', {}, '或')),
    area,
    el('div', { class: 'paste-actions' }, button('開始去識別化', go, 'btn btn-primary'), el('span', { class: 'muted small' }, '貼上的文字會以純文字處理，結果可下載為 .txt 或直接複製')),
  );
}

function renderToolbar(root: HTMLElement): HTMLElement {
  const d = current();
  const doc = d.doc;
  const limits = formatLimitations(doc.format);
  const many = state.docs.length > 1;
  return el(
    'div',
    { class: 'toolbar toolbar-stack' },
    el('div', { class: 'toolbar-row' },
      el('div', { class: 'file-info' },
        el('strong', {}, doc.fileName),
        el('span', { class: 'badge' }, doc.format.toUpperCase()),
        el('span', { class: 'muted' }, ` ${doc.text.length.toLocaleString()} 字`),
        many ? el('span', { class: 'muted' }, `　（第 ${state.active + 1} / ${state.docs.length} 個檔案）`) : null,
      ),
      el('div', { class: 'toolbar-actions' },
        button('重新偵測', () => redetect(root), 'btn'),
        button(many ? '全部清除' : '換一個檔案', () => resetAll(root), 'btn btn-ghost'),
        el('span', { class: 'toolbar-sep' }),
        button(many ? '下載此檔' : '下載去識別化文件', () => void downloadDoc(d), 'btn btn-primary'),
        button(many ? '下載此檔編碼表' : '下載編碼表 (CSV)', () => downloadCsv(d), 'btn btn-primary'),
        doc.format === 'txt' || doc.format === 'md' ? button('複製去識別化文字', () => void copyText(d), 'btn') : null,
        many ? button(`打包下載全部（${state.docs.length} 個檔案 + 編碼表）`, () => void downloadAll(root), 'btn btn-primary btn-strong') : null,
      ),
    ),
    el('div', { class: 'toolbar-row muted small' },
      el('span', {}, '編碼表是還原的唯一憑證，請妥善保管。'),
      limits ? el('span', { class: 'notice notice-inline' }, limits) : null,
    ),
  );
}

function renderFilePanel(root: HTMLElement, refresh: () => void): HTMLElement {
  const panel = el('aside', { class: 'file-panel' });
  const list = el('ul', { class: 'file-list' });
  state.docs.forEach((d, i) => {
    const active = d.items.filter((it) => it.active).length;
    const done = d.downloadedDoc && d.downloadedCsv;
    list.append(
      el(
        'li',
        { class: `file-item${i === state.active ? ' active' : ''}` },
        el('button', { type: 'button', class: 'file-item-main', onClick: () => { state.active = i; render(root); } },
          el('span', { class: 'file-item-name', title: d.doc.fileName }, d.doc.fileName),
          el('span', { class: 'file-item-meta' },
            el('span', { class: 'badge' }, d.doc.format.toUpperCase()),
            el('span', { class: 'muted small' }, ` ${active} / ${d.items.length} 筆`),
            done ? el('span', { class: 'tag tag-done' }, '已下載') : null,
          ),
        ),
        el('button', { type: 'button', class: 'file-item-remove', title: '移除此檔案', onClick: () => removeDoc(i, root) }, '×'),
      ),
    );
  });
  const input = el('input', { type: 'file', accept: ACCEPT_ATTR, multiple: true, hidden: true }) as HTMLInputElement;
  input.addEventListener('change', () => {
    if (input.files?.length) void loadFiles(Array.from(input.files), root);
    input.value = '';
  });
  panel.append(
    el('div', { class: 'file-panel-head' }, el('h3', {}, `檔案（${state.docs.length}/${MAX_FILES}）`)),
    list,
    state.docs.length < MAX_FILES ? button('＋ 加入檔案', () => input.click(), 'btn btn-small') : el('p', { class: 'muted small' }, `已達 ${MAX_FILES} 個上限`),
    input,
  );
  void refresh;
  return panel;
}

function renderWorkspace(root: HTMLElement): HTMLElement {
  const d = current();
  const preview = el('div', { class: 'preview', tabindex: '0' });
  const sidebar = el('aside', { class: 'sidebar' });
  const legendHost = el('div', {});
  const listToggleHost = el('div', { class: 'list-toggle-host' });
  const previewWrap = el('div', { class: 'preview-wrap' },
    el('div', { class: 'preview-head' }, el('h3', {}, '去識別化預覽'), listToggleHost),
    el('p', { class: 'muted small' }, `${previewHint(d.doc)}預覽以遮罩樣式呈現（如 王OO、0912-***-678）；滑鼠移到標記可看原文與輸出標記，點擊標記可取消；圈選文字可手動新增項目。`),
    legendHost,
    preview,
  );
  const ws = el('div', { class: 'workspace' });
  const refresh = () => {
    clear(legendHost);
    legendHost.append(renderLegend(refresh));
    clear(listToggleHost);
    const active = d.items.filter((it) => it.active).length;
    listToggleHost.append(
      button(`${state.showList ? '▾ 收合' : '▸ 展開'}偵測清單（生效 ${active} / 共 ${d.items.length}）`, () => {
        state.showList = !state.showList;
        refresh();
      }, 'btn btn-small'),
    );
    ws.classList.toggle('workspace-with-list', state.showList);
    ws.classList.toggle('workspace-with-files', state.docs.length > 1);
    sidebar.hidden = !state.showList;
    renderPreview(preview, refresh, root);
    if (state.showList) renderSidebar(sidebar, preview, refresh);
  };
  if (state.docs.length > 1) ws.append(renderFilePanel(root, refresh));
  ws.append(previewWrap, sidebar);
  refresh();
  return ws;
}

function renderLegend(refresh: () => void): HTMLElement {
  const d = current();
  const toggle = el('input', { type: 'checkbox' }) as HTMLInputElement;
  toggle.checked = state.showMarkers;
  toggle.addEventListener('change', () => {
    state.showMarkers = toggle.checked;
    refresh();
  });
  const plainToggle = el('input', { type: 'checkbox' }) as HTMLInputElement;
  plainToggle.checked = state.plainView;
  plainToggle.addEventListener('change', () => {
    state.plainView = plainToggle.checked;
    refresh();
  });
  const counts = new Map<Category, number>();
  for (const it of d.items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  return el(
    'div',
    { class: 'legend' },
    el('span', { class: 'legend-title', title: '點擊種類可整批取消該類去識別化（套用到所有檔案），再點一次復原' }, '去識別化種類：'),
    ...CATEGORIES.map((c) => {
      const off = state.disabledCategories.has(c);
      const n = counts.get(c) ?? 0;
      return el(
        'button',
        {
          type: 'button',
          class: `legend-chip mark-${c}${off ? ' legend-off' : ''}`,
          title: off ? `已取消全部「${c}」，點擊復原` : `點擊取消全部「${c}」（此檔 ${n} 筆）`,
          onClick: () => {
            setCategoryEnabled(c, off);
            refresh();
          },
        },
        n ? `${c} ${n}` : c,
      );
    }),
    el('span', { class: 'legend-toggles' },
      d.doc.layout ? el('label', { class: 'legend-toggle' }, plainToggle, ' 純文字檢視') : null,
      el('label', { class: 'legend-toggle' }, toggle, ' 顯示實際輸出標記 [類別:編碼]'),
    ),
  );
}

function previewHint(doc: LoadedDocument): string {
  switch (doc.layout?.kind) {
    case 'docx':
      return 'Word 以段落、標題、表格與頁首頁尾呈現；';
    case 'xlsx':
      return 'Excel 以工作表格線呈現，上方可切換工作表；';
    case 'pdf':
      return 'PDF 依原始座標逐頁排版；';
    default:
      return '';
  }
}

function renderPreview(preview: HTMLElement, refresh: () => void, root: HTMLElement): void {
  const d = current();
  const decorations: Decoration[] = d.items.map((it) =>
    it.active
      ? {
          start: it.start,
          end: it.end,
          id: it.id,
          kind: 'mark',
          label: state.showMarkers ? buildMarker(it.category, it.code) : maskDisplay(it.category, it.original),
          className: `mark-${it.category}${state.showMarkers ? ' mark-code' : ''}`,
          tip: tooltipFor(it),
        }
      : { start: it.start, end: it.end, id: it.id, kind: 'cancelled', label: '', className: '', tip: `已取消，顯示原文（${it.category}）；點擊可加回` },
  );
  renderDocumentPreview(preview, d.doc, decorations, { plain: state.plainView });
  preview.onmouseup = () => handleSelection(preview, refresh, root);
  preview.onclick = (e) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-id]');
    if (!target || !preview.contains(target)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a drag-selection, not a click
    const item = d.items.find((it) => it.id === target.dataset.id);
    if (item) showItemPopup(target.getBoundingClientRect(), item, refresh, root);
  };
}

function showItemPopup(rect: DOMRect, item: RedactionItem, done: () => void, root: HTMLElement): void {
  document.querySelector('.add-popup')?.remove();
  const d = current();
  const popup = el(
    'div',
    { class: 'add-popup' },
    el('div', { class: 'add-popup-text' },
      el('span', { class: `badge badge-${item.category}` }, item.category),
      ` ${item.original} → ${maskDisplay(item.category, item.original)}`,
      el('div', { class: 'muted small' }, `輸出標記 ${buildMarker(item.category, item.code)}${item.origin === 'manual' ? '（手動新增）' : ''}`),
    ),
    el('div', { class: 'add-popup-row' },
      el('span', {}, item.active ? '要取消這一筆的去識別化嗎？' : '要把這一筆加回去識別化嗎？'),
      button(item.active ? '取消去識別化' : '加回', () => {
        try {
          toggleItem(d.items, item.id);
          markDirty(d);
          popup.remove();
          done();
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      }, item.active ? 'btn btn-danger-solid' : 'btn btn-primary'),
      button('關閉', () => popup.remove(), 'btn btn-ghost'),
    ),
  );
  placePopup(popup, rect, root);
}

function placePopup(popup: HTMLElement, rect: DOMRect, root: HTMLElement): void {
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 380));
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
  root.ownerDocument.body.append(popup);
}

function offsetOf(container: Node, offset: number): number | null {
  const elNode = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  const holder = elNode?.closest('[data-start]') as HTMLElement | null;
  if (!holder) return null;
  const base = Number(holder.dataset.start);
  if (holder.dataset.plain) {
    return container.nodeType === Node.TEXT_NODE ? base + offset : base;
  }
  // Inside a mark/cancelled span: snap to its boundary.
  return offset === 0 ? base : Number(holder.dataset.end);
}

function handleSelection(preview: HTMLElement, refresh: () => void, root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) return;
  const a = offsetOf(range.startContainer, range.startOffset);
  const b = offsetOf(range.endContainer, range.endOffset);
  if (a === null || b === null) return;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end <= start) return;
  showAddPopup(range.getBoundingClientRect(), start, end, () => {
    sel.removeAllRanges();
    refresh();
  }, root);
}

function showAddPopup(rect: DOMRect, start: number, end: number, done: () => void, root: HTMLElement): void {
  document.querySelector('.add-popup')?.remove();
  const d = current();
  const text = d.doc.text.slice(start, end);
  const select = el('select', { class: 'select' }, ...CATEGORIES.map((c) => el('option', { value: c }, c)));
  const popup = el(
    'div',
    { class: 'add-popup' },
    el('div', { class: 'add-popup-text' }, `「${text.length > 40 ? text.slice(0, 40) + '…' : text}」`),
    el('div', { class: 'add-popup-row' }, select, button('新增為去識別化項目', () => {
      try {
        addManualItem(d.items, d.doc.text, start, end, select.value as Category, d.used);
        markDirty(d);
        popup.remove();
        toast('已新增', 'success', 1500);
        done();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, 'btn btn-primary'), button('取消', () => popup.remove(), 'btn btn-ghost')),
  );
  placePopup(popup, rect, root);
}

function renderSidebar(sidebar: HTMLElement, preview: HTMLElement, refresh: () => void): void {
  clear(sidebar);
  const d = current();
  const active = d.items.filter((it) => it.active);

  const list = el('ul', { class: 'item-list' });
  const sorted = [...d.items].sort((a, b) => a.start - b.start);
  for (const it of sorted) {
    const li = el(
      'li',
      { class: `item ${it.active ? '' : 'item-cancelled'}` },
      el('div', { class: 'item-main', title: tooltipFor(it), onClick: () => locate(preview, it.id) },
        el('span', { class: `badge badge-${it.category}` }, it.category),
        el('span', { class: 'item-original' }, it.original),
        el('span', { class: 'item-mask muted' }, `→ ${maskDisplay(it.category, it.original)}`),
        it.origin === 'manual' ? el('span', { class: 'tag' }, '手動') : null,
      ),
      el('div', { class: 'item-meta' }, button(it.active ? '取消' : '加回', () => {
        try {
          toggleItem(d.items, it.id);
          markDirty(d);
          refresh();
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      }, 'btn btn-small')),
    );
    list.append(li);
  }

  sidebar.append(
    el('h3', {}, `偵測項目（生效 ${active.length} / 共 ${d.items.length}）`),
    d.items.length === 0 ? el('p', { class: 'muted' }, '目前沒有項目。可在預覽中圈選文字新增。') : list,
  );
}

function locate(preview: HTMLElement, id: string): void {
  const node = preview.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1200);
}

// ---------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------
async function downloadDoc(d: DocState): Promise<void> {
  try {
    const { edits } = applyRedactions(d.doc.text, d.items);
    toast('產生檔案中…', 'info', 2000);
    const blob = await generateDocument(d.doc, edits);
    downloadBlob(blob, outputFileName(d.doc.fileName, 'deid'));
    d.downloadedDoc = true;
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function csvBlob(d: DocState): Blob {
  const { mapping } = applyRedactions(d.doc.text, d.items);
  return new Blob([serializeMapping(mapping)], { type: 'text/csv;charset=utf-8' });
}

function downloadCsv(d: DocState): void {
  downloadBlob(csvBlob(d), mappingFileName(d.doc.fileName));
  d.downloadedCsv = true;
}

async function copyText(d: DocState): Promise<void> {
  const { redactedText } = applyRedactions(d.doc.text, d.items);
  try {
    await navigator.clipboard.writeText(redactedText);
    toast('已複製去識別化文字（編碼表仍需另外下載才能還原）', 'success', 4000);
  } catch {
    toast('無法存取剪貼簿，請改用下載', 'error');
  }
}

/** Every document plus its mapping table in one archive (see formats/batch.ts). */
async function downloadAll(root: HTMLElement): Promise<void> {
  try {
    toast(`打包 ${state.docs.length} 個檔案中…`, 'info', 3000);
    const { blob } = await buildArchive(state.docs.map((d) => ({ doc: d.doc, items: d.items })));
    for (const d of state.docs) {
      d.downloadedDoc = true;
      d.downloadedCsv = true;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    downloadBlob(blob, `去識別化-${stamp}.zip`);
    toast('已打包下載全部檔案與編碼表', 'success');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}
