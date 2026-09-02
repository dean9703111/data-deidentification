type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastHost: HTMLElement | null = null;
export function toast(message: string, kind: 'info' | 'error' | 'success' = 'info', ms = 4000): void {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const t = el('div', { class: `toast toast-${kind}` }, message);
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
}

export interface DropZoneOptions {
  accept: string;
  label: string;
  hint?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

export function dropZone(opts: DropZoneOptions): HTMLElement {
  const input = el('input', { type: 'file', accept: opts.accept, hidden: true, multiple: !!opts.multiple });
  input.addEventListener('change', () => {
    if (input.files?.length) opts.onFiles(Array.from(input.files));
    input.value = '';
  });
  const zone = el(
    'div',
    { class: 'dropzone', tabindex: '0', role: 'button' },
    el('div', { class: 'dropzone-label' }, opts.label),
    opts.hint ? el('div', { class: 'dropzone-hint' }, opts.hint) : null,
    input,
  );
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input.click();
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) opts.onFiles(files);
  });
  return zone;
}

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  return el('button', { class: cls, type: 'button', onClick: () => onClick() }, label);
}

let tipEl: HTMLElement | null = null;
/** One global tooltip for every element carrying `data-tip`; lives on <body> so scroll containers cannot clip it. */
export function installTooltips(): void {
  const show = (target: HTMLElement) => {
    if (!tipEl) {
      tipEl = el('div', { class: 'tooltip', role: 'tooltip' });
      document.body.append(tipEl);
    }
    tipEl.textContent = target.dataset.tip ?? '';
    tipEl.hidden = false;
    const r = target.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - tw - 8));
    const top = r.bottom + 6 + th > window.innerHeight ? r.top - th - 6 : r.bottom + 6;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  };
  const hide = () => {
    if (tipEl) tipEl.hidden = true;
  };
  document.addEventListener('mouseover', (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-tip]');
    if (t) show(t);
    else hide();
  });
  document.addEventListener('scroll', hide, true);
}
