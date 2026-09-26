import type { CustomPatternConfig, Pattern, PatternConfig, Retention } from './types';
import { BUILTIN_PATTERNS } from './patterns';
import { sanitizeRetention } from './retention';

export const STORAGE_KEY = 'deid.patternConfig.v1';

function defaultConfig(): PatternConfig {
  return { version: 1, disabledBuiltins: [], customPatterns: [] };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadConfig(): PatternConfig {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return defaultConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<PatternConfig>;
    if (parsed.version !== 1) return defaultConfig();
    return {
      version: 1,
      disabledBuiltins: Array.isArray(parsed.disabledBuiltins) ? parsed.disabledBuiltins.filter((x) => typeof x === 'string') : [],
      customPatterns: Array.isArray(parsed.customPatterns)
        ? parsed.customPatterns.filter((c) => c && typeof c.regex === 'string' && validateRegex(c.regex) === null)
        : [],
      retention: readRetention(parsed.retention),
    };
  } catch {
    return defaultConfig();
  }
}

function readRetention(x: unknown): Record<string, Retention> {
  const out: Record<string, Retention> = {};
  if (!x || typeof x !== 'object') return out;
  for (const [id, r] of Object.entries(x)) {
    const ok = sanitizeRetention(r);
    if (ok && ok.mode !== 'none') out[id] = ok;
  }
  return out;
}

export function saveConfig(config: PatternConfig): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Returns an error message, or null when the regex compiles with the 'gu' flags. */
export function validateRegex(src: string): string | null {
  if (!src.trim()) return '規則不可為空';
  try {
    const re = new RegExp(src, 'gu');
    if (re.test('')) return '規則不可比對空字串';
    return null;
  } catch (e) {
    return `無效的規則：${(e as Error).message}`;
  }
}

export function getEffectivePatterns(config: PatternConfig = loadConfig()): Pattern[] {
  const disabled = new Set(config.disabledBuiltins);
  const retention = config.retention ?? {};
  const builtins = BUILTIN_PATTERNS.map((p) => ({ ...p, enabled: !disabled.has(p.id), retention: retention[p.id] }));
  const customs: Pattern[] = config.customPatterns.map((c) => ({ ...c, source: 'custom', retention: retention[c.id] }));
  return [...builtins, ...customs];
}

export function setBuiltinEnabled(config: PatternConfig, id: string, enabled: boolean): PatternConfig {
  const set = new Set(config.disabledBuiltins);
  if (enabled) set.delete(id);
  else set.add(id);
  return { ...config, disabledBuiltins: [...set] };
}

export function upsertCustom(config: PatternConfig, custom: CustomPatternConfig): PatternConfig {
  const err = validateRegex(custom.regex);
  if (err) throw new Error(err);
  const idx = config.customPatterns.findIndex((c) => c.id === custom.id);
  const list = [...config.customPatterns];
  if (idx >= 0) list[idx] = custom;
  else list.push(custom);
  return { ...config, customPatterns: list };
}

export function removeCustom(config: PatternConfig, id: string): PatternConfig {
  const retention = { ...(config.retention ?? {}) };
  delete retention[id];
  return { ...config, customPatterns: config.customPatterns.filter((c) => c.id !== id), retention };
}

export function setRetention(config: PatternConfig, id: string, r: Retention): PatternConfig {
  const retention = { ...(config.retention ?? {}) };
  if (r.mode === 'none') delete retention[id];
  else retention[id] = r;
  return { ...config, retention };
}

export function newCustomId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return 'c-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
