import './styles.css';
import { el, installTooltips } from './ui/components';
import { createProcessView, hasUnsavedResults } from './ui/process-view';
import { createPatternsView } from './ui/patterns-view';
import { createRestoreView } from './ui/restore-view';

type TabId = 'process' | 'patterns' | 'restore';

const TABS: { id: TabId; label: string; create: () => HTMLElement }[] = [
  { id: 'process', label: '去識別化', create: createProcessView },
  { id: 'patterns', label: '偵測規則', create: createPatternsView },
  { id: 'restore', label: '還原', create: createRestoreView },
];

function mount(): void {
  const app = document.getElementById('app')!;
  const nav = el('nav', { class: 'tabs' });
  const panels = el('main', { class: 'panels' });
  const views = new Map<TabId, HTMLElement>();

  const activate = (id: TabId) => {
    for (const t of TABS) {
      nav.querySelector(`[data-tab="${t.id}"]`)?.classList.toggle('active', t.id === id);
      let v = views.get(t.id);
      if (!v && t.id === id) {
        v = t.create();
        views.set(t.id, v);
        panels.append(v);
      }
      if (v) v.hidden = t.id !== id;
    }
    // Pattern changes made in another tab should be visible on return.
    if (id === 'patterns') {
      const fresh = createPatternsView();
      views.get('patterns')?.replaceWith(fresh);
      views.set('patterns', fresh);
    }
  };

  for (const t of TABS) {
    nav.append(el('button', { class: 'tab', 'data-tab': t.id, type: 'button', onClick: () => activate(t.id) }, t.label));
  }

  app.append(
    el('header', { class: 'header' },
      el('div', { class: 'brand' }, el('h1', {}, '文件去識別化工具'), el('span', { class: 'muted' }, '純前端處理・文件不離開你的電腦')),
      nav,
    ),
    panels,
  );
  activate('process');

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedResults()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

mount();
installTooltips();
