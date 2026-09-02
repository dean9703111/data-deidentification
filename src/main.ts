import './styles.css';
import { el, installTooltips } from './ui/components';
import { createProcessView, hasUnsavedResults } from './ui/process-view';
import { createPatternsView } from './ui/patterns-view';
import { createRestoreView } from './ui/restore-view';

type TabId = 'process' | 'patterns' | 'restore';

/** Brand marks as inline SVG (no external requests), drawn with currentColor. */
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="${d}"/></svg>`;
const ICONS = {
  github: svg('M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'),
  youtube: svg('M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'),
  facebook: svg('M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'),
  medium: svg('M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z'),
  // Threads mark approximated as its "@"-style spiral.
  threads: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M16.2 8.6c-.9-1.9-2.6-2.9-4.7-2.9-3.4 0-5.6 2.7-5.6 6.4s2.2 6.3 5.7 6.3c2.9 0 4.9-1.6 4.9-4 0-2.2-1.7-3.5-4.1-3.5-1.9 0-3.3.9-3.3 2.3 0 1.2 1 2 2.6 2 2.2 0 3.4-1.7 3.5-4.4"/></svg>',
};

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

  const social: [string, string, string][] = [
    ['Medium', 'https://medium.com/@dean-lin', ICONS.medium],
    ['Facebook', 'https://www.facebook.com/deanlinbao', ICONS.facebook],
    ['Threads', 'https://www.threads.com/@deanlin5288', ICONS.threads],
    ['YouTube', 'https://www.youtube.com/@dlcorner', ICONS.youtube],
    ['GitHub', 'https://github.com/dean9703111', ICONS.github],
  ];
  app.append(
    el('header', { class: 'header' },
      el('div', { class: 'brand' }, el('h1', {}, '文件去識別化工具'), el('span', { class: 'muted' }, '純前端處理・文件不離開你的電腦')),
      nav,
    ),
    panels,
    el('footer', { class: 'footer' },
      el('div', { class: 'footer-inner' },
        el('div', {},
          el('strong', {}, '文件去識別化工具'),
          el('span', { class: 'muted' }, '　開源專案（MIT）・'),
          el('a', { href: 'https://github.com/dean9703111/data-deidentification', target: '_blank', rel: 'noopener' }, '原始碼與說明'),
        ),
        el('div', { class: 'footer-social' },
          ...social.map(([name, url, icon]) => {
            const a = el('a', { class: 'social-link', href: url, target: '_blank', rel: 'noopener', title: name, 'aria-label': name });
            a.innerHTML = icon;
            a.append(el('span', {}, name));
            return a;
          }),
        ),
      ),
    ),
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
