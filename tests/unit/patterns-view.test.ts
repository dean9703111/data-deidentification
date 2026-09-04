import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPatternsView } from '../../src/ui/patterns-view';
import { STORAGE_KEY } from '../../src/core/pattern-store';

const byLabel = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('.form-actions button')].find((b) => b.textContent === label)!;

beforeEach(() => {
  localStorage.clear();
  // Only drop earlier views: wiping <body> would detach the toast host that components.ts keeps a reference to.
  document.querySelectorAll('.patterns-view').forEach((v) => v.remove());
});

describe('patterns view helpers', () => {
  it('「填入範例」fills every field with a working rule and shows its hits without saving anything', () => {
    const view = createPatternsView();
    document.body.append(view);
    byLabel(view, '填入範例').click();

    expect(view.querySelector<HTMLInputElement>('input[placeholder="例如：員工編號"]')!.value).toBe('員工編號');
    expect(view.querySelector<HTMLSelectElement>('select')!.value).toBe('識別碼');
    expect(view.querySelector<HTMLInputElement>('input.mono')!.value).toBe('EMP-\\d{6}');
    expect(view.querySelector<HTMLInputElement>('input[placeholder="例如：EMP-004521"]')!.value).toBe('EMP-004521');
    expect(view.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('EMP-004521');

    const marks = [...view.querySelectorAll('.hits mark')].map((m) => m.textContent);
    expect(marks).toEqual(['EMP-004521', 'EMP-000317']);
    expect(view.querySelector('.hits')!.textContent).toContain('命中 2 筆');
    expect(view.querySelector('.field-error')!.textContent).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('「複製 AI 提示詞」previews the prompt on hover and copies it on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const view = createPatternsView();
    document.body.append(view);
    const btn = byLabel(view, '複製 AI 提示詞');

    const tip = btn.dataset.tip!;
    expect(tip).toContain('JavaScript 正規表達式');
    expect(tip).toContain("'gu'");
    expect(tip).toContain('識別碼');

    btn.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(tip));
    await vi.waitFor(() => expect(document.querySelector('.toast-success')?.textContent).toContain('已複製提示詞'));
  });

  it('hides 「填入範例」while editing an existing rule so it cannot clobber it', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      disabledBuiltins: [],
      customPatterns: [{ id: 'c-1', name: '案號', category: '識別碼', regex: 'CASE-\\d+', example: 'CASE-1', enabled: true }],
    }));
    const view = createPatternsView();
    document.body.append(view);
    expect(byLabel(view, '填入範例')).toBeDefined();
    [...view.querySelectorAll<HTMLButtonElement>('.col-actions button')].find((b) => b.textContent === '編輯')!.click();
    expect(byLabel(view, '填入範例')).toBeUndefined();
    expect(byLabel(view, '複製 AI 提示詞')).toBeDefined();
  });
});
