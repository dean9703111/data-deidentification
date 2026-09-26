import type { Category, LoadedDocument, MappingEntry, RedactionItem, Retention } from '../core/types';
import { CATEGORIES } from '../core/types';
import { addManualItem, detect, resplitItems, toggleItem } from '../core/detector';
import { applyRedactions, isPartial, mergeMappings, outputFor, previewLabel } from '../core/redactor';
import { CodeBook, parseMarkers } from '../core/codes';
import { parseMapping, serializeMapping } from '../core/csv';
import { getEffectivePatterns, loadConfig, saveConfig, setCategoryRetention } from '../core/pattern-store';
import { MODE_LABELS, checkRetention, describeRetention, modesFor, splitFor, type RetentionMode } from '../core/retention';
import { ACCEPT_ATTR, formatLimitations, generateDocument, mappingFileName, outputFileName, parseDocument } from '../formats';
import { button, clear, downloadBlob, dropZone, el, toast, withBusy } from './components';
import { renderDocumentPreview, type Decoration } from './preview';
import { MERGED_MAPPING_NAME, buildArchive } from '../formats/batch';
import { SAMPLES, samplesSection } from './samples';

export const MAX_FILES = 10;

/** 全部隱藏 hides every value; 部分保留 keeps the standard visible characters; 自訂 is set per category. */
type OutputMode = 'code' | 'preview' | 'custom';
const OUTPUT_MODE_LABELS: Record<OutputMode, string> = { code: '全部隱藏', preview: '部分保留', custom: '自訂' };
const OUTPUT_MODE_EXAMPLES: Record<OutputMode, string> = {
  code: 'A123456789 → [身分證]',
  preview: 'A123456789 → A12[身分證]9',
  custom: '逐類別設定',
};

/** One uploaded (or pasted) document and everything the user has done to it. */
interface DocState {
  doc: LoadedDocument;
  items: RedactionItem[];
  book: CodeBook;
  /** Bumped on every change that alters the output; downloads remember the version they were made from. */
  version: number;
  docVer: number;
  csvVer: number;
}

interface State {
  docs: DocState[];
  /** Index into `docs` of the document shown in the preview. */
  active: number;
  /** Ignore the document layout (Word/Excel/PDF) and preview as plain text. */
  plainView: boolean;
  /** Categories switched off in the category table (applies to every document). */
  disabledCategories: Set<Category>;
  /** The detection list is collapsed by default. */
  showList: boolean;
  /** The output settings panel is collapsed to a one-line summary by default. */
  panelOpen: boolean;
  /** Every document shares one code book. */
  sharedCodes: boolean;
  /** Imported mapping table; its codes are reused for identical values. */
  imported: { fileName: string; entries: MappingEntry[] } | null;
  /** The batch-wide book while sharedCodes is on; created with the first document. */
  sharedBook: CodeBook | null;
  /** How much of each value stays visible in the output (applies to every document). */
  outputMode: OutputMode;
  /** 自訂 mode: per-category retention overriding the rules' own setting. */
  overrides: Map<Category, Retention>;
}

const state: State = {
  docs: [],
  active: 0,
  plainView: false,
  disabledCategories: new Set(),
  showList: false,
  panelOpen: false,
  sharedCodes: false,
  imported: null,
  sharedBook: null,
  outputMode: 'code',
  overrides: new Map(),
};

/** Retention of the first enabled rule of a category (the 自訂 default before any override). */
function ruleRetention(category: Category): Retention | undefined {
  const r = getEffectivePatterns().find((p) => p.enabled && p.category === category)?.retention;
  return r && r.mode !== 'none' ? r : undefined;
}

/** What an item keeps under the current output mode; manual items follow their category like detected ones. */
function effectiveRetention(it: RedactionItem): Retention | undefined {
  if (state.outputMode === 'code') return undefined;
  if (state.outputMode === 'preview') return { mode: 'preview' };
  return state.overrides.get(it.category) ?? it.retention;
}

function applyOutputMode(d: DocState): void {
  resplitItems(d.items, d.book, effectiveRetention);
}

function applyOutputModeToAll(): void {
  for (const d of state.docs) {
    applyOutputMode(d);
    markDirty(d);
  }
}

/** Seeded from the imported table when there is one; one book for the whole batch when codes are shared. */
function bookForNewDoc(): CodeBook {
  if (state.sharedCodes && state.sharedBook) return state.sharedBook;
  const book = new CodeBook();
  if (state.imported) book.seed(state.imported.entries);
  if (state.sharedCodes) state.sharedBook = book;
  return book;
}

/** Code scope changed mid-way: give every document a fresh book and reassign all codes. */
function rebuildBooks(): void {
  state.sharedBook = null;
  for (const d of state.docs) d.book = bookForNewDoc();
  applyOutputModeToAll();
}

/** A batch-wide table is offered whenever codes can repeat across files or continue an earlier table. */
const hasMergedTable = (): boolean => state.sharedCodes || state.imported !== null;

function mergedMapping(): MappingEntry[] {
  return mergeMappings(state.imported?.entries ?? [], ...state.docs.map((d) => applyRedactions(d.doc.text, d.items).mapping));
}

const current = (): DocState => state.docs[state.active];

function markDirty(d: DocState): void {
  d.version++;
}

const isDownloaded = (d: DocState): boolean => d.docVer === d.version && d.csvVer === d.version;

function tooltipFor(it: RedactionItem): string {
  return `${it.category}｜原文：${it.original}｜輸出標記：${outputFor(it)}${it.origin === 'manual' ? '｜手動新增' : ''}`;
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

/** Newly detected items honour the categories switched off in the category table. */
function applyDisabledCategories(d: DocState): void {
  for (const it of d.items) if (state.disabledCategories.has(it.category)) it.active = false;
}

export function hasUnsavedResults(): boolean {
  return state.docs.some((d) => d.items.some((it) => it.active) && !isDownloaded(d));
}

export function createProcessView(): HTMLElement {
  const root = el('section', { class: 'view process-view' });
  render(root);
  return root;
}

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------
/** Parsing a PDF/Word file (and loading its parser) can take a while: lock the page and show progress meanwhile. */
function loadFiles(files: File[], root: HTMLElement): Promise<void> {
  return withBusy('讀取檔案中…', () => importFiles(files, root));
}

async function importFiles(files: File[], root: HTMLElement): Promise<void> {
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
      const book = bookForNewDoc();
      const d: DocState = { doc, items: detect(doc.text, getEffectivePatterns(), book), book, version: 0, docVer: -1, csvVer: -1 };
      applyOutputMode(d);
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
  const fresh = detect(d.doc.text, getEffectivePatterns(), d.book).filter((a) => !manual.some((m) => m.active && a.start < m.end && a.end > m.start));
  d.items = [...manual, ...fresh].sort((a, b) => a.start - b.start);
  applyOutputMode(d);
  applyDisabledCategories(d);
  markDirty(d);
  toast(`重新偵測完成：自動 ${fresh.length} 筆、手動 ${manual.length} 筆`, 'success');
  render(root);
}

function removeDoc(index: number, root: HTMLElement): void {
  const d = state.docs[index];
  if (d.items.some((it) => it.active) && !isDownloaded(d) && !confirm(`「${d.doc.fileName}」尚未下載去識別化結果與編碼表，確定要移除嗎？`)) return;
  state.docs.splice(index, 1);
  state.active = Math.min(state.active, Math.max(0, state.docs.length - 1));
  render(root);
}

function resetAll(root: HTMLElement): void {
  if (hasUnsavedResults() && !confirm('尚有檔案未下載去識別化結果與編碼表，確定要全部清除嗎？')) return;
  state.docs = [];
  state.active = 0;
  state.sharedBook = null;
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
      el('details', { class: 'code-options', open: state.sharedCodes || state.imported !== null },
        el('summary', {}, '進階：跨檔案共用編碼'),
        renderCodeScope(root),
      ),
      samplesSection('沒有檔案？用範例體驗', SAMPLES, (file) => loadFiles([file], root)),
    );
    return;
  }
  root.append(renderToolbar(root), renderWorkspace(root));
}

/**
 * Code scope (shared across the batch / continued from an imported table). Can be changed at any
 * time: once documents are loaded every code is reassigned and the files need downloading again.
 */
function renderCodeScope(root: HTMLElement): HTMLElement {
  const changed = (msg: string) => {
    if (state.docs.length) {
      rebuildBooks();
      toast(`${msg}；所有檔案的編碼已重新配置，請重新下載`, 'info', 5000);
    }
    render(root);
  };
  const shared = el('input', { type: 'checkbox' }) as HTMLInputElement;
  shared.checked = state.sharedCodes;
  shared.addEventListener('change', () => {
    state.sharedCodes = shared.checked;
    changed(shared.checked ? '已開啟整批共用編碼' : '已關閉整批共用編碼');
  });
  const input = el('input', { type: 'file', accept: '.csv,text/csv', hidden: true }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const { entries, errors } = parseMapping(await file.text());
    if (errors.length) {
      toast(`編碼表格式錯誤，未匯入：${errors.slice(0, 3).join('；')}`, 'error', 8000);
      return;
    }
    const warnings = new CodeBook().seed(entries);
    state.imported = { fileName: file.name, entries };
    for (const w of warnings.slice(0, 3)) toast(w, 'error', 8000);
    changed(`已匯入 ${entries.length} 筆編碼，相同的值會沿用原編碼`);
  });
  return el(
    'div',
    { class: 'code-scope' },
    el('label', { class: 'check-label' }, shared, ' 整批共用編碼：同一批檔案中，相同的值使用同一個編碼（方便跨檔案對照）'),
    el('div', { class: 'code-options-row' },
      button(state.imported ? '改匯入其他編碼表' : '匯入既有編碼表（沿用編碼）', () => input.click(), 'btn btn-small'),
      state.imported
        ? el('span', {}, ` 已匯入「${state.imported.fileName}」共 ${state.imported.entries.length} 筆 `, button('移除', () => {
            state.imported = null;
            changed('已移除匯入的編碼表');
          }, 'btn btn-ghost btn-small'))
        : null,
      input,
    ),
    el('p', { class: 'muted small' }, '匯入上次下載的編碼表（或合併編碼表）後，相同的值會沿用原編碼，新值才產生新編碼，可用於每月資料串接。合併編碼表會累積歷次所有個資，請長期妥善保管；匯入的編碼表只存在這個分頁的記憶體中。'),
  );
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

/** A small dropdown of secondary actions; closes after picking one. */
function menu(label: string, items: ([string, () => void] | null)[]): HTMLElement {
  const box = el('details', { class: 'menu' }) as HTMLDetailsElement;
  const list = el('div', { class: 'menu-list' });
  for (const it of items) {
    if (!it) continue;
    list.append(button(it[0], () => {
      box.open = false;
      it[1]();
    }, 'menu-item'));
  }
  box.append(el('summary', { class: 'btn' }, label), list);
  return box;
}

function renderToolbar(root: HTMLElement): HTMLElement {
  const d = current();
  const doc = d.doc;
  const limits = formatLimitations(doc.format);
  const many = state.docs.length > 1;
  const partialCats = [...new Set(d.items.filter((it) => it.active && isPartial(it)).map((it) => it.category))];
  const status = [
    `輸出方式：${OUTPUT_MODE_LABELS[state.outputMode]}`,
    state.sharedCodes ? '整批共用編碼' : '',
    state.imported ? `沿用「${state.imported.fileName}」的編碼` : '',
  ].filter(Boolean);
  const text = doc.format === 'txt' || doc.format === 'md';
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
        many
          ? button(`打包下載全部（${state.docs.length} 個檔案）`, () => void downloadAll(root), 'btn btn-primary btn-strong')
          : button('下載（文件＋編碼表）', () => void downloadBoth(d, root), 'btn btn-primary btn-strong'),
        menu('更多 ▾', [
          many ? ['下載此檔（文件＋編碼表）', () => void downloadBoth(d, root)] : null,
          ['只下載去識別化文件', () => void downloadDoc(d, root)],
          ['只下載編碼表 (CSV)', () => downloadCsv(d, root)],
          text ? ['複製去識別化文字', () => void copyText(d)] : null,
          hasMergedTable() ? ['下載合併編碼表', downloadMerged] : null,
        ]),
      ),
    ),
    el('div', { class: 'toolbar-row status-line muted small' },
      el('span', {}, `編碼表是還原的唯一憑證，請妥善保管。${status.join('・')}`,
        limits ? el('span', { class: 'status-info', 'data-tip': limits, tabindex: '0' }, ' ⓘ 格式限制') : null,
      ),
      partialCats.length ? el('span', { class: 'notice notice-inline' }, `⚠ 含部分保留欄位：${partialCats.join('、')}（保留的字元會出現在輸出中，並非完全匿名）`) : null,
    ),
  );
}

function renderFilePanel(root: HTMLElement): HTMLElement {
  const panel = el('aside', { class: 'file-panel' });
  const list = el('ul', { class: 'file-list' });
  state.docs.forEach((d, i) => {
    const active = d.items.filter((it) => it.active).length;
    list.append(
      el(
        'li',
        { class: `file-item${i === state.active ? ' active' : ''}` },
        el('button', { type: 'button', class: 'file-item-main', onClick: () => { state.active = i; render(root); } },
          el('span', { class: 'file-item-name', title: d.doc.fileName }, d.doc.fileName),
          el('span', { class: 'file-item-meta' },
            el('span', { class: 'badge' }, d.doc.format.toUpperCase()),
            el('span', { class: 'muted small' }, ` ${active} / ${d.items.length} 筆`),
            isDownloaded(d) ? el('span', { class: 'tag tag-done' }, '已下載') : null,
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
  return panel;
}

function renderWorkspace(root: HTMLElement): HTMLElement {
  const d = current();
  const preview = el('div', { class: 'preview', tabindex: '0' });
  const sidebar = el('aside', { class: 'sidebar' });
  const outputHost = el('div', {});
  const headTools = el('div', { class: 'preview-head-tools' });
  const previewWrap = el('div', { class: 'preview-wrap' },
    el('div', { class: 'preview-head' }, el('h3', {}, '去識別化預覽'), headTools),
    el('p', { class: 'muted small' }, `${previewHint(d.doc)}預覽即下載後的樣子（編碼以 [類別] 表示）；滑鼠移到標記可看原文與實際編碼，點擊標記可取消，圈選文字可手動新增。`),
    outputHost,
    preview,
  );
  const ws = el('div', { class: 'workspace' });
  const refresh = () => {
    clear(outputHost);
    outputHost.append(renderOutputPanel(root));
    clear(headTools);
    const active = d.items.filter((it) => it.active).length;
    const plain = el('input', { type: 'checkbox' }) as HTMLInputElement;
    plain.checked = state.plainView;
    plain.addEventListener('change', () => {
      state.plainView = plain.checked;
      refresh();
    });
    if (d.doc.layout) headTools.append(el('label', { class: 'check-label small' }, plain, ' 純文字檢視'));
    headTools.append(
      button(`${state.showList ? '▾ 收合' : '▸ 展開'}偵測清單（生效 ${active} / 共 ${d.items.length}）`, () => {
        state.showList = !state.showList;
        refresh();
      }, 'btn btn-small list-toggle'),
    );
    ws.classList.toggle('workspace-with-list', state.showList);
    ws.classList.toggle('workspace-with-files', state.docs.length > 1);
    sidebar.hidden = !state.showList;
    renderPreview(preview, refresh, root);
    if (state.showList) renderSidebar(sidebar, preview, refresh);
  };
  if (state.docs.length > 1) ws.append(renderFilePanel(root));
  ws.append(previewWrap, sidebar);
  refresh();
  return ws;
}

/**
 * The single place to decide what the output shows: mode, per-category on/off and retention,
 * 設為預設, and the code scope. Collapsed to a one-line summary by default.
 */
function renderOutputPanel(root: HTMLElement): HTMLElement {
  const setMode = (mode: OutputMode) => {
    state.outputMode = mode;
    applyOutputModeToAll();
    render(root); // preview, toolbar status and partial-retention notice all change
  };
  const radios = (Object.keys(OUTPUT_MODE_LABELS) as OutputMode[]).map((mode) => {
    const r = el('input', { type: 'radio', name: 'output-mode', value: mode }) as HTMLInputElement;
    r.checked = state.outputMode === mode;
    r.addEventListener('change', () => setMode(mode));
    return el('label', { class: 'mode-option' }, r, el('span', {}, el('strong', {}, OUTPUT_MODE_LABELS[mode]), el('span', { class: 'mono small muted' }, OUTPUT_MODE_EXAMPLES[mode])));
  });
  const active = state.docs.reduce((n, d) => n + d.items.filter((it) => it.active).length, 0);
  const box = el('details', { class: 'output-panel', open: state.panelOpen }) as HTMLDetailsElement;
  box.addEventListener('toggle', () => {
    state.panelOpen = box.open;
  });
  const saveDefault = () => {
    let config = loadConfig();
    for (const [category, r] of state.overrides) config = setCategoryRetention(config, category, r);
    saveConfig(config);
    // The saved default is now each item's own rule retention, so the output stays the same after clearing overrides.
    for (const d of state.docs) {
      for (const it of d.items) {
        const r = state.overrides.get(it.category);
        if (!r) continue;
        if (r.mode === 'none') delete it.retention;
        else it.retention = r;
      }
    }
    state.overrides.clear();
    toast('已設為預設：之後選「自訂」會套用這些保留方式（可在「偵測規則」頁的「保留」欄查看）', 'success', 5000);
    render(root);
  };
  const children: (HTMLElement | null)[] = [
    el('summary', { class: 'output-panel-summary' },
      el('strong', {}, '輸出方式：'),
      `${OUTPUT_MODE_LABELS[state.outputMode]}・生效 ${active} 筆`,
      state.sharedCodes || state.imported ? '・共用／沿用編碼' : '',
      el('span', { class: 'muted small' }, '（點擊調整類別、保留方式與編碼範圍）'),
    ),
    el('div', { class: 'output-modes' }, ...radios),
    state.outputMode === 'preview'
      ? el('p', { class: 'small notice notice-inline' }, '⚠ 部分保留會露出較多字元（例如手機 10 碼露出 7 碼），接收方較容易辨識出個人。')
      : null,
    renderCategoryTable(root),
    state.outputMode === 'custom'
      ? el('div', { class: 'form-actions' },
          button('設為預設', saveDefault, 'btn btn-small'),
          el('span', { class: 'muted small' }, state.overrides.size ? '把目前各類別的保留方式存為預設，之後選「自訂」會自動套用。' : '目前沿用預設值。'),
        )
      : null,
    el('h4', { class: 'output-subhead' }, '編碼範圍'),
    renderCodeScope(root),
  ];
  box.append(...children.filter((c): c is HTMLElement => c !== null));
  return box;
}

function renderCategoryTable(root: HTMLElement): HTMLElement {
  const present = CATEGORIES.filter((c) => state.docs.some((d) => d.items.some((it) => it.category === c)));
  if (present.length === 0) return el('p', { class: 'muted small' }, '目前沒有偵測項目。');
  const custom = state.outputMode === 'custom';
  const rows = present.map((category) => {
    const items = state.docs.flatMap((d) => d.items).filter((it) => it.category === category);
    const sample = items[0].original;
    const off = state.disabledCategories.has(category);
    const enabled = el('input', { type: 'checkbox', title: '取消勾選即整類不去識別化（套用到所有檔案）' }) as HTMLInputElement;
    enabled.checked = !off;
    enabled.addEventListener('change', () => {
      setCategoryEnabled(category, enabled.checked);
      render(root);
    });
    const override = state.overrides.get(category);
    const applied: Retention | undefined = state.outputMode === 'code' ? undefined : state.outputMode === 'preview' ? { mode: 'preview' } : override ?? ruleRetention(category);
    const out = el('span', { class: 'mono small' });
    const msg = el('span', { class: 'small' });
    const show = (r: Retention | undefined) => {
      const s = splitFor(sample, r, category);
      out.textContent = `${sample} → ${sample.slice(0, s.head)}[${category}]${sample.slice(sample.length - s.tail)}`;
    };
    show(applied);
    let control: HTMLElement;
    if (!custom || off) {
      control = el('span', { class: 'muted small' }, off ? '不處理' : describeRetention(applied));
    } else {
      const current: Retention = override ?? ruleRetention(category) ?? { mode: 'none' };
      const mode = el('select', { class: 'select' },
        el('option', { value: 'rule' }, `預設（${describeRetention(ruleRetention(category))}）`),
        ...modesFor(category).map((m) => el('option', { value: m }, MODE_LABELS[m])),
      ) as HTMLSelectElement;
      mode.value = override ? override.mode : 'rule';
      const head = el('input', { class: 'input input-num', type: 'number', min: '0', value: String(current.mode === 'ends' ? current.head : 0) }) as HTMLInputElement;
      const tail = el('input', { class: 'input input-num', type: 'number', min: '0', value: String(current.mode === 'ends' ? current.tail : 0) }) as HTMLInputElement;
      const delim = el('input', { class: 'input input-num', value: current.mode === 'delim' ? current.delimiter : '@' }) as HTMLInputElement;
      const side = el('select', { class: 'select' }, el('option', { value: 'after' }, '之後'), el('option', { value: 'before' }, '之前')) as HTMLSelectElement;
      if (current.mode === 'delim') side.value = current.side;
      const endsBox = el('span', { class: 'retention-fields', hidden: mode.value !== 'ends' }, '前 ', head, ' 後 ', tail);
      const delimBox = el('span', { class: 'retention-fields', hidden: mode.value !== 'delim' }, delim, side);
      const read = (): Retention | null => {
        const m = mode.value as RetentionMode | 'rule';
        if (m === 'rule') return null;
        if (m === 'ends') return { mode: 'ends', head: Number(head.value), tail: Number(tail.value) };
        if (m === 'delim') return { mode: 'delim', delimiter: delim.value, side: side.value as 'before' | 'after' };
        return { mode: m } as Retention;
      };
      const paint = (r: Retention | null): boolean => {
        const check = r ? checkRetention(sample, r, category) : { error: null, warnings: [] };
        msg.className = `small ${check.error ? 'field-error' : check.warnings.length ? 'notice notice-inline' : ''}`;
        msg.textContent = check.error ?? (check.warnings.length ? `⚠ ${check.warnings.join(' ')}` : '');
        show(r ?? ruleRetention(category));
        return !check.error;
      };
      const apply = () => {
        endsBox.hidden = mode.value !== 'ends';
        delimBox.hidden = mode.value !== 'delim';
        const r = read();
        if (!paint(r)) return; // keep the invalid input on screen with its error, output unchanged
        if (r) state.overrides.set(category, r);
        else state.overrides.delete(category);
        applyOutputModeToAll();
        render(root);
      };
      for (const input of [mode, head, tail, delim, side]) input.addEventListener('change', apply);
      paint(override ?? null);
      control = el('span', { class: 'retention-control' }, mode, endsBox, delimBox);
    }
    return el('tr', { class: off ? 'row-disabled' : '' },
      el('td', { class: 'col-nowrap' }, el('label', { class: 'check-label' }, enabled, el('span', { class: `badge badge-${category}` }, category), el('span', { class: 'muted small' }, ` ${items.length} 筆`))),
      el('td', {}, control),
      el('td', {}, out, ' ', msg),
    );
  });
  return el('div', { class: 'table-wrap' }, el('table', { class: 'table output-table' }, el('tbody', {}, ...rows)));
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
      ? { start: it.start, end: it.end, id: it.id, kind: 'mark', label: previewLabel(it), className: `mark-${it.category}`, tip: tooltipFor(it) }
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
      ` ${item.original} → ${previewLabel(item)}`,
      el('div', { class: 'muted small' }, `輸出標記 ${outputFor(item)}${item.origin === 'manual' ? '（手動新增）' : ''}`),
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
  const select = el('select', { class: 'select' }, ...CATEGORIES.map((c) => el('option', { value: c }, c))) as HTMLSelectElement;
  const popup = el(
    'div',
    { class: 'add-popup' },
    el('div', { class: 'add-popup-text' }, `「${text.length > 40 ? text.slice(0, 40) + '…' : text}」`),
    el('div', { class: 'add-popup-row' }, select, button('新增為去識別化項目', () => {
      try {
        // FR-009: manual items follow their category's retention, like detected ones.
        const rule = getEffectivePatterns().find((p) => p.enabled && p.category === select.value);
        addManualItem(d.items, d.doc.text, start, end, select.value as Category, d.book, rule?.retention);
        applyOutputMode(d);
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
        el('span', { class: 'item-mask muted' }, `→ ${previewLabel(it)}`),
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
/** FR-002: a lone download whose partner was taken from an older version would not restore. */
function warnIfStale(partnerVer: number, d: DocState, partner: string): void {
  if (partnerVer >= 0 && partnerVer !== d.version) {
    toast(`之前下載的${partner}是舊版本，和這次的檔案對不起來，請重新下載${partner}`, 'error', 8000);
  }
}

async function saveDoc(d: DocState): Promise<void> {
  const { edits } = applyRedactions(d.doc.text, d.items);
  const blob = await generateDocument(d.doc, edits);
  downloadBlob(blob, outputFileName(d.doc.fileName, 'deid'));
  d.docVer = d.version;
}

function saveCsv(d: DocState): void {
  const { mapping } = applyRedactions(d.doc.text, d.items);
  downloadBlob(new Blob([serializeMapping(mapping)], { type: 'text/csv;charset=utf-8' }), mappingFileName(d.doc.fileName));
  d.csvVer = d.version;
}

/** The main action: the document and its mapping table together, so the pair always matches. */
async function downloadBoth(d: DocState, root: HTMLElement): Promise<void> {
  try {
    toast('產生檔案中…', 'info', 2000);
    await saveDoc(d);
    saveCsv(d);
    toast('已下載去識別化文件與編碼表', 'success');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

async function downloadDoc(d: DocState, root: HTMLElement): Promise<void> {
  try {
    toast('產生檔案中…', 'info', 2000);
    await saveDoc(d);
    warnIfStale(d.csvVer, d, '編碼表');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function downloadCsv(d: DocState, root: HTMLElement): void {
  saveCsv(d);
  warnIfStale(d.docVer, d, '去識別化文件');
  render(root);
}

function downloadMerged(): void {
  downloadBlob(new Blob([serializeMapping(mergedMapping())], { type: 'text/csv;charset=utf-8' }), MERGED_MAPPING_NAME);
  toast('合併編碼表涵蓋匯入的編碼與本批所有編碼，下次處理時可再匯入沿用；請妥善保管', 'success', 5000);
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
    const { blob } = await buildArchive(state.docs.map((d) => ({ doc: d.doc, items: d.items })), hasMergedTable() ? mergedMapping() : undefined);
    for (const d of state.docs) {
      d.docVer = d.version;
      d.csvVer = d.version;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    downloadBlob(blob, `去識別化-${stamp}.zip`);
    toast('已打包下載全部檔案與編碼表', 'success');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}
