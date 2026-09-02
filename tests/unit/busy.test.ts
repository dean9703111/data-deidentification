import { describe, expect, it } from 'vitest';
import { withBusy } from '../../src/ui/components';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('withBusy', () => {
  it('locks #app for the whole task and shows the overlay once the task turns out to be slow', async () => {
    document.body.innerHTML = '<div id="app"><button>x</button></div>';
    const app = document.getElementById('app')!;
    let finish!: () => void;
    const run = withBusy('載入範例中…', () => new Promise<void>((r) => (finish = r)));

    expect(app.hasAttribute('inert')).toBe(true);
    await tick(200);
    const overlay = document.querySelector<HTMLElement>('.busy-overlay')!;
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain('載入範例中…');

    finish();
    await run;
    expect(app.hasAttribute('inert')).toBe(false);
    expect(overlay.hidden).toBe(true);
  });

  it('does not flash the overlay for a task that finishes quickly, and unlocks even when it throws', async () => {
    const app = document.getElementById('app')!;
    await expect(withBusy('讀取檔案中…', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(app.hasAttribute('inert')).toBe(false);
    await tick(200);
    expect(document.querySelector<HTMLElement>('.busy-overlay')!.hidden).toBe(true);
  });
});
