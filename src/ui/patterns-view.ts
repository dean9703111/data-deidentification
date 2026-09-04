import type { Category, CustomPatternConfig, Pattern, PatternConfig } from '../core/types';
import { CATEGORIES } from '../core/types';
import { getEffectivePatterns, loadConfig, newCustomId, removeCustom, saveConfig, setBuiltinEnabled, upsertCustom, validateRegex } from '../core/pattern-store';
import { compilePattern } from '../core/detector';
import { button, clear, el, toast } from './components';

/** Filled into the "new rule" form by the 填入範例 button so first-time users can see a working rule end to end. */
const SAMPLE_RULE = {
  name: '員工編號',
  category: '識別碼' as Category,
  regex: 'EMP-\\d{6}',
  example: 'EMP-004521',
  sample: '承辦人員工編號 EMP-004521，協辦 EMP-000317；舊制編號 EMP-12345 位數不足，不會命中。',
};

/** Prompt users can paste into an AI assistant to get a rule that fits this tool's RegExp constraints. */
const AI_PROMPT = [
  '我在使用「文件去識別化工具」，需要新增一條自訂偵測規則，請幫我寫一個 JavaScript 正規表達式（RegExp）。限制如下：',
  '1. 工具會以 new RegExp(規則, \'gu\') 在整份文件中搜尋，請只回覆規則本身，不要加前後斜線、flags，也不要加 ^ 或 $。',
  '2. 規則不可比對到空字串，且只能使用 JavaScript 支援的語法。',
  '3. 請避免過度寬鬆而誤抓一般文字。',
  '',
  '我要偵測的內容：（描述格式，例如：員工編號，EMP- 開頭接 6 位數字）',
  '應該命中的例子：（例如：EMP-004521、EMP-000317）',
  '不應該命中的例子與原因：（例如：EMP-12345 只有 5 位數字、emp-004521 是小寫開頭）',
  '',
  `請依序回覆：規則名稱、建議類別（${CATEGORIES.join('／')} 擇一）、規則、一個範例值，並簡短說明規則各部分的意思。`,
].join('\n');

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  // Plain-http intranet hosting has no navigator.clipboard; fall back to the legacy command.
  const ta = el('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

export function createPatternsView(): HTMLElement {
  const root = el('section', { class: 'view patterns-view' });
  render(root);
  return root;
}

function render(root: HTMLElement, editing: CustomPatternConfig | null = null): void {
  clear(root);
  const config = loadConfig();
  const patterns = getEffectivePatterns(config);
  root.append(
    el('h2', {}, '偵測規則'),
    el('p', { class: 'muted' }, '所有規則皆以正規表達式（JavaScript RegExp，flags: gu）比對。內建規則可停用但不可修改；自訂規則可新增、編輯、刪除。設定僅儲存在你的瀏覽器中。'),
    renderTable(root, config, patterns),
    renderForm(root, config, editing),
  );
}

function renderTable(root: HTMLElement, config: PatternConfig, patterns: Pattern[]): HTMLElement {
  const rows = patterns.map((p) => {
    const toggle = el('input', { type: 'checkbox' }) as HTMLInputElement;
    toggle.checked = p.enabled;
    toggle.addEventListener('change', () => {
      let next: PatternConfig;
      if (p.source === 'builtin') next = setBuiltinEnabled(config, p.id, toggle.checked);
      else next = upsertCustom(config, { ...(config.customPatterns.find((c) => c.id === p.id)!), enabled: toggle.checked });
      saveConfig(next);
      toast(`${p.name} 已${toggle.checked ? '啟用' : '停用'}`, 'success', 1500);
      render(root);
    });
    const actions = el('td', { class: 'col-actions' });
    if (p.source === 'custom') {
      const custom = config.customPatterns.find((c) => c.id === p.id)!;
      actions.append(
        button('編輯', () => render(root, custom), 'btn btn-small'),
        button('刪除', () => {
          if (!confirm(`刪除自訂規則「${p.name}」？`)) return;
          saveConfig(removeCustom(config, p.id));
          render(root);
        }, 'btn btn-small btn-danger'),
      );
    }
    return el(
      'tr',
      { class: p.enabled ? '' : 'row-disabled' },
      el('td', { class: 'col-center' }, el('label', { class: 'switch' }, toggle)),
      el('td', { class: 'col-nowrap' }, p.name),
      el('td', { class: 'col-nowrap' }, el('span', { class: `badge badge-${p.category}` }, p.category)),
      el('td', {}, el('code', { class: 'regex' }, p.regex.length > 90 ? p.regex.slice(0, 90) + '…' : p.regex)),
      el('td', { class: 'muted' }, p.example),
      el('td', { class: 'col-nowrap' }, el('span', { class: 'tag' }, p.source === 'builtin' ? '內建' : '自訂')),
      actions,
    );
  });
  return el(
    'div',
    { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', { class: 'col-center col-nowrap' }, '啟用'), el('th', {}, '名稱'), el('th', {}, '類別'), el('th', {}, '比對規則'), el('th', {}, '範例'), el('th', {}, '來源'), el('th', {}, ''))),
      el('tbody', {}, ...rows),
    ),
  );
}

function renderForm(root: HTMLElement, config: PatternConfig, editing: CustomPatternConfig | null): HTMLElement {
  const name = el('input', { class: 'input', placeholder: '例如：員工編號', value: editing?.name ?? '' }) as HTMLInputElement;
  const category = el('select', { class: 'select' }, ...CATEGORIES.map((c) => el('option', { value: c }, c))) as HTMLSelectElement;
  category.value = editing?.category ?? '識別碼';
  const regex = el('input', { class: 'input mono', placeholder: '例如：EMP-\\d{6}', value: editing?.regex ?? '' }) as HTMLInputElement;
  const example = el('input', { class: 'input', placeholder: '例如：EMP-004521', value: editing?.example ?? '' }) as HTMLInputElement;
  const sample = el('textarea', { class: 'input', rows: '3', placeholder: '貼上測試文字，即時檢視命中結果' }) as HTMLTextAreaElement;
  const regexError = el('div', { class: 'field-error' });
  const hits = el('div', { class: 'hits' });

  const preview = () => {
    const err = validateRegex(regex.value);
    regexError.textContent = err ?? '';
    clear(hits);
    if (err || !sample.value) return;
    const re = compilePattern({ regex: regex.value } as Pattern);
    if (!re) return;
    const found = [...sample.value.matchAll(re)].map((m) => m[0]);
    hits.append(found.length === 0 ? el('span', { class: 'muted' }, '無命中') : el('span', {}, `命中 ${found.length} 筆：`), ...found.map((f) => el('mark', { class: 'mark mark-識別碼' }, f)));
  };
  regex.addEventListener('input', preview);
  sample.addEventListener('input', preview);
  if (editing) preview();

  const save = () => {
    const err = validateRegex(regex.value);
    if (err) {
      regexError.textContent = err;
      return;
    }
    if (!name.value.trim()) {
      toast('請輸入規則名稱', 'error');
      return;
    }
    try {
      const next = upsertCustom(config, {
        id: editing?.id ?? newCustomId(),
        name: name.value.trim(),
        category: category.value as Category,
        regex: regex.value,
        example: example.value.trim(),
        enabled: editing?.enabled ?? true,
      });
      saveConfig(next);
      toast(editing ? '規則已更新' : '規則已新增', 'success');
      render(root);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const fillSample = () => {
    name.value = SAMPLE_RULE.name;
    category.value = SAMPLE_RULE.category;
    regex.value = SAMPLE_RULE.regex;
    example.value = SAMPLE_RULE.example;
    sample.value = SAMPLE_RULE.sample;
    preview();
    toast('已填入範例規則，可直接修改，再按「新增規則」儲存', 'info', 3000);
  };
  const copyPrompt = async () => {
    try {
      await copyToClipboard(AI_PROMPT);
      toast('已複製提示詞，貼給 ChatGPT、Claude 或 Gemini，並補上你要偵測的格式與例子', 'success', 5000);
    } catch {
      toast('無法存取剪貼簿，請改用支援的瀏覽器', 'error');
    }
  };

  return el(
    'div',
    { class: 'form-card' },
    el('h3', {}, editing ? `編輯自訂規則：${editing.name}` : '新增自訂規則'),
    el('div', { class: 'form-grid' },
      el('label', {}, '名稱', name),
      el('label', {}, '類別', category),
      el('label', { class: 'span-2' }, '比對規則（RegExp）', regex, regexError),
      el('label', { class: 'span-2' }, '範例', example),
      el('label', { class: 'span-2' }, '測試文字', sample, hits),
    ),
    el('div', { class: 'form-actions' },
      button(editing ? '儲存變更' : '新增規則', save, 'btn btn-primary'),
      editing ? button('取消編輯', () => render(root), 'btn btn-ghost') : null,
      editing ? null : button('填入範例', fillSample, 'btn'),
      el('button', { class: 'btn', type: 'button', 'data-tip': AI_PROMPT, onClick: () => void copyPrompt() }, '複製 AI 提示詞'),
    ),
  );
}
