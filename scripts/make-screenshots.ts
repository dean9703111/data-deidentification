// Produces the annotated screenshots used in README.md (docs/screenshots/*.png).
// Prerequisite: the built site served at BASE_URL (default: `npm run preview` → http://localhost:4173).
// Run: npm run screenshots
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = 'docs/screenshots';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });

const ANNOTATE = `
window.__shot = (targets) => {
  let st = document.getElementById('shot-style');
  if (!st) { st = document.createElement('style'); st.id = 'shot-style'; document.head.append(st); }
  st.textContent = '.shot-box{outline:3px solid #e53935!important;outline-offset:4px;border-radius:4px}' +
    '.shot-num{position:absolute;z-index:99;background:#e53935;color:#fff;font:bold 15px/1 -apple-system,"Noto Sans TC",sans-serif;' +
    'padding:5px 9px;border-radius:14px;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.3)}';
  document.querySelectorAll('.shot-box').forEach((e) => e.classList.remove('shot-box'));
  document.querySelectorAll('.shot-num').forEach((e) => e.remove());
  for (const [sel, n] of targets) {
    const e = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!e) { console.warn('shot target missing', sel); continue; }
    e.classList.add('shot-box');
    const r = e.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'shot-num';
    b.textContent = String(n);
    b.style.left = (r.left + window.scrollX - 30) + 'px';
    b.style.top = (r.top + window.scrollY - 12) + 'px';
    document.body.append(b);
  }
};`;

async function annotate(page: Page, targets: [string, number][]): Promise<void> {
  await page.evaluate(ANNOTATE);
  await page.evaluate((t) => (window as unknown as { __shot: (x: unknown) => void }).__shot(t), targets);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // A sticky header would be painted over the page top in full-page captures.
  if (fullPage) await page.evaluate(() => ((document.querySelector('.header') as HTMLElement).style.position = 'static'));
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  if (fullPage) await page.evaluate(() => ((document.querySelector('.header') as HTMLElement).style.position = ''));
  console.log('saved', `${OUT}/${name}.png`);
}

async function upload(page: Page, inputSelector: string, file: string): Promise<void> {
  const input = await page.waitForSelector(inputSelector);
  await input!.uploadFile(resolve(file));
  await new Promise((r) => setTimeout(r, 600));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
page.on('dialog', (d) => void d.accept());
await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

// 1. Upload screen (file drop zone + paste box + shared-code options)
await page.evaluate(() => ((document.querySelector('.code-options') as HTMLDetailsElement).open = true));
await annotate(page, [['.tabs', 1], ['.dropzone', 2], ['.paste-area', 3], ['.paste-actions .btn', 4], ['.code-options', 5]]);
await shot(page, '01-upload');

// 2. Preview after detection (list collapsed by default)
await upload(page, '.process-view input[type=file]', 'examples/01-核心流程/委外服務契約書.docx');
await annotate(page, [['.legend', 1], ['.preview', 2], ['.list-toggle-host .btn', 3], ['.toolbar-actions', 4]]);
await shot(page, '02-preview');

// 2a. Batch: several files at once, file panel on the left, zip download
await page.evaluate(() => (document.querySelector('.toolbar-actions .btn-ghost') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));
{
  const input = await page.waitForSelector('.process-view input[type=file]');
  await input!.uploadFile(
    ...['委外服務契約書.docx', '報價單.pdf', '客戶資料.xlsx', '客服信件.txt', '專案會議紀錄.md'].map((f) => resolve('examples/01-核心流程/' + f)),
  );
  await page.waitForSelector('.file-panel', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));
}
await annotate(page, [['.file-panel', 1], ['.file-item.active', 2], ['.file-panel .btn', 3], ['.btn-strong', 4]]);
await shot(page, '02a-batch');
await page.evaluate(() => (document.querySelector('.toolbar-actions .btn-ghost') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));
await upload(page, '.process-view input[type=file]', 'examples/01-核心流程/客戶資料.xlsx');
await annotate(page, [['.sheet-tabs', 1], ['.sheet-scroll', 2], ['.legend-toggles', 3]]);
await shot(page, '02b-preview-xlsx');
// 2c. PDF preview: pages laid out at original coordinates
await page.evaluate(() => (document.querySelector('.toolbar-actions .btn-ghost') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));
await upload(page, '.process-view input[type=file]', 'examples/01-核心流程/報價單.pdf');
await annotate(page, [['.pdf-page-label', 1], ['.pdf-page', 2]]);
await shot(page, '02c-preview-pdf');

// back to the contract for the remaining steps
await page.evaluate(() => (document.querySelector('.toolbar-actions .btn-ghost') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));
await upload(page, '.process-view input[type=file]', 'examples/01-核心流程/委外服務契約書.docx');

// 2d/2e. Output mode: 同預覽 (preview mask with codes in place of the stars), then 自訂 per category
const showMarkers = (on: boolean) =>
  page.evaluate((v) => {
    const t = document.querySelector('.legend-toggles .legend-toggle:last-child input') as HTMLInputElement;
    if (t.checked !== v) t.click();
  }, on);
await page.click('input[name=output-mode][value=preview]');
await new Promise((r) => setTimeout(r, 300));
await showMarkers(true);
await annotate(page, [['.output-panel-head', 1], ['.output-panel p', 2], ['.preview', 3]]);
await shot(page, '02d-output-preview');
await page.click('input[name=output-mode][value=custom]');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.output-table tr')].find((tr) => tr.textContent!.includes('身分證'))!;
  const sel = row.querySelector('select') as HTMLSelectElement;
  sel.value = 'ends';
  sel.dispatchEvent(new Event('change'));
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.output-table tr')].find((tr) => tr.textContent!.includes('身分證'))!;
  const head = row.querySelector('input[type=number]') as HTMLInputElement;
  head.value = '2';
  head.dispatchEvent(new Event('change'));
});
await new Promise((r) => setTimeout(r, 300));
await showMarkers(true);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.output-table tr')].find((tr) => tr.textContent!.includes('身分證'))!;
  row.classList.add('shot-row');
});
await annotate(page, [['.output-table', 1], ['.output-table .shot-row', 2], ['.toolbar-row.muted .notice', 3]]);
await shot(page, '02e-output-custom');
// back to 全部編碼 with the friendly mask for the remaining steps
await page.click('input[name=output-mode][value=code]');
await new Promise((r) => setTimeout(r, 300));
await showMarkers(false);

// 3. Tooltip on hover
await page.evaluate(() => {
  const m = document.querySelectorAll('.preview .mark')[2] as HTMLElement;
  m.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
});
await annotate(page, [['.tooltip', 1], ['.legend-toggles .legend-toggle:last-child', 2]]);
await shot(page, '03-tooltip');
await page.evaluate(() => (document.querySelector<HTMLElement>('.tooltip')!.hidden = true));

// 4. Click a mark → confirmation popup, then cancel it
await page.evaluate(() => {
  const m = document.querySelectorAll('.preview .mark')[2] as HTMLElement;
  m.classList.add('shot-target');
  m.click();
});
await new Promise((r) => setTimeout(r, 200));
await annotate(page, [['.preview .shot-target', 1], ['.add-popup', 2]]);
await shot(page, '04-click-cancel');
await page.evaluate(() => ([...document.querySelectorAll<HTMLButtonElement>('.add-popup .btn')].find((b) => b.textContent === '取消去識別化')!).click());
await new Promise((r) => setTimeout(r, 200));

// 4b. Legend category toggle (市話 off) + expanded list showing cancelled items
await page.evaluate(() => ([...document.querySelectorAll<HTMLButtonElement>('.legend-chip')].find((b) => b.textContent!.startsWith('市話'))!).click());
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => (document.querySelector('.list-toggle-host .btn') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));
await annotate(page, [['.legend-chip.legend-off', 1], ['.cancelled', 2], ['.item-list', 3], ['.item-cancelled .btn', 4]]);
await shot(page, '04b-category-list');
await page.evaluate(() => (document.querySelector('.list-toggle-host .btn') as HTMLButtonElement).click());
await new Promise((r) => setTimeout(r, 300));

// 4c. Add manually via selection popup
await page.evaluate(() => {
  const plain = [...document.querySelectorAll<HTMLElement>('.preview [data-plain]')].find((s) => s.textContent!.includes('SC-2026-0917'))!;
  const idx = plain.textContent!.indexOf('SC-2026-0917');
  const range = document.createRange();
  range.setStart(plain.firstChild!, idx);
  range.setEnd(plain.firstChild!, idx + 'SC-2026-0917'.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.querySelector('.preview')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
await page.select('.add-popup select', '識別碼'); // first select = category (retention choice only shows in 自訂)
await annotate(page, [['.add-popup', 1]]);
await shot(page, '04c-add');
await page.evaluate(() => document.querySelector('.add-popup')?.remove());

// 5. Download bar
await page.evaluate(() => window.scrollTo(0, 0));
await annotate(page, [['.toolbar-actions .btn-primary', 1], ['.toolbar-row.muted', 2]]);
await shot(page, '05-download');

// 6. Patterns page with a custom rule being tested
await page.click('[data-tab="patterns"]');
await new Promise((r) => setTimeout(r, 300));
await page.type('.form-card input[placeholder="例如：員工編號"]', '員工編號');
await page.type('.form-card input.mono', 'EMP-\\d{6}');
await page.type('.form-card input[placeholder="例如：EMP-004521"]', 'EMP-004521');
await page.type('.form-card textarea', '承辦 EMP-004521 與 EMP-000001');
await annotate(page, [['.table-wrap', 1], ['.switch', 2], ['.form-card', 3], ['.hits', 4]]);
await shot(page, '06-patterns', true);

// 6b. Retention setting of a rule (身分證 keeps the first 2 characters)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.patterns-view tbody tr')].find((tr) => tr.textContent!.includes('A123456789'))!;
  const btn = [...row.querySelectorAll<HTMLButtonElement>('button')].find((b) => /隱藏|保留/.test(b.textContent!))!;
  btn.classList.add('shot-keep');
  btn.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const ed = document.querySelector('.retention-editor')!;
  const sel = ed.querySelector('select') as HTMLSelectElement;
  sel.value = 'ends';
  sel.dispatchEvent(new Event('input'));
  const head = ed.querySelector('input[type=number]') as HTMLInputElement;
  head.value = '2';
  head.dispatchEvent(new Event('input'));
  ed.scrollIntoView({ block: 'center' });
});
await new Promise((r) => setTimeout(r, 300));
await annotate(page, [['.patterns-view thead th:nth-child(7)', 1], ['.retention-controls', 2], ['.retention-preview', 3], ['.retention-editor .form-actions', 4]]);
await shot(page, '06b-retention');

// 7. Restore page with a missing-code warning
await page.click('[data-tab="restore"]');
await new Promise((r) => setTimeout(r, 300));
const inputs = await page.$$('.restore-view input[type=file]');
await inputs[0].uploadFile(resolve('examples/03-還原/委外服務契約書.deid.docx'));
await new Promise((r) => setTimeout(r, 500));
const csvInput = (await page.$$('.restore-view input[type=file]')).at(-1)!;
await csvInput.uploadFile(resolve('examples/03-還原/委外服務契約書.mapping.缺一列.csv'));
await new Promise((r) => setTimeout(r, 800));
await annotate(page, [['.restore-inputs', 1], ['.restore-result .toolbar', 2], ['.notice-warn', 3], ['.restore-result .preview', 4]]);
await shot(page, '07-restore');

await browser.close();
