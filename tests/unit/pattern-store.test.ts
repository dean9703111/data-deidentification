import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  loadConfig,
  saveConfig,
  getEffectivePatterns,
  setBuiltinEnabled,
  upsertCustom,
  removeCustom,
  validateRegex,
  newCustomId,
} from '../../src/core/pattern-store';
import type { CustomPatternConfig } from '../../src/core/types';

const BUILTIN_IDS = ['zh-name', 'tw-id', 'tw-mobile', 'tw-landline', 'tw-address', 'email'];

beforeEach(() => {
  localStorage.clear();
});

describe('STORAGE_KEY', () => {
  it('is the expected storage key', () => {
    expect(STORAGE_KEY).toBe('deid.patternConfig.v1');
  });
});

describe('loadConfig', () => {
  it('returns the default config when storage is empty', () => {
    expect(loadConfig()).toEqual({ version: 1, disabledBuiltins: [], customPatterns: [] });
  });

  it('resets to default on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json!!');
    expect(loadConfig()).toEqual({ version: 1, disabledBuiltins: [], customPatterns: [] });
  });

  it('resets to default when version is not 1', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, disabledBuiltins: ['tw-id'], customPatterns: [] }),
    );
    expect(loadConfig()).toEqual({ version: 1, disabledBuiltins: [], customPatterns: [] });
  });

  it('filters out custom patterns with invalid regex, keeping the valid ones', () => {
    const good: CustomPatternConfig = {
      id: 'c-good',
      name: 'good',
      category: '識別碼',
      regex: '\\d{4}',
      example: '1234',
      enabled: true,
    };
    const bad: CustomPatternConfig = {
      id: 'c-bad',
      name: 'bad',
      category: '識別碼',
      regex: '(', // invalid regex
      example: 'x',
      enabled: true,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, disabledBuiltins: [], customPatterns: [good, bad] }),
    );
    const config = loadConfig();
    expect(config.customPatterns).toHaveLength(1);
    expect(config.customPatterns[0].id).toBe('c-good');
  });
});

describe('getEffectivePatterns', () => {
  it('includes all 6 builtin ids enabled with source builtin by default', () => {
    const patterns = getEffectivePatterns(loadConfig());
    for (const id of BUILTIN_IDS) {
      const p = patterns.find((x) => x.id === id);
      expect(p).toBeDefined();
      expect(p!.enabled).toBe(true);
      expect(p!.source).toBe('builtin');
    }
  });

  it('uses loadConfig() by default when no argument is passed', () => {
    const patterns = getEffectivePatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(BUILTIN_IDS.length);
  });
});

describe('setBuiltinEnabled + save/load round-trip', () => {
  it('disables and re-enables a builtin pattern', () => {
    let config = loadConfig();
    config = setBuiltinEnabled(config, 'tw-mobile', false);
    saveConfig(config);

    let effective = getEffectivePatterns(loadConfig());
    const mobile = effective.find((p) => p.id === 'tw-mobile');
    expect(mobile).toBeDefined();
    expect(mobile!.enabled).toBe(false);

    let reloaded = loadConfig();
    expect(reloaded.disabledBuiltins).toContain('tw-mobile');

    reloaded = setBuiltinEnabled(reloaded, 'tw-mobile', true);
    saveConfig(reloaded);
    expect(loadConfig().disabledBuiltins).not.toContain('tw-mobile');

    effective = getEffectivePatterns(loadConfig());
    expect(effective.find((p) => p.id === 'tw-mobile')!.enabled).toBe(true);
  });
});

describe('upsertCustom / removeCustom', () => {
  it('round-trips a custom pattern through save/load and exposes it via getEffectivePatterns', () => {
    let config = loadConfig();
    const custom: CustomPatternConfig = {
      id: 'c-abc123',
      name: '員工編號',
      category: '識別碼',
      regex: 'EMP\\d{4}',
      example: 'EMP1234',
      enabled: true,
    };
    config = upsertCustom(config, custom);
    saveConfig(config);

    const reloaded = loadConfig();
    expect(reloaded.customPatterns).toHaveLength(1);
    expect(reloaded.customPatterns[0]).toEqual(custom);

    const effective = getEffectivePatterns(reloaded);
    const found = effective.find((p) => p.id === 'c-abc123');
    expect(found).toBeDefined();
    expect(found!.source).toBe('custom');
    expect(found!.name).toBe('員工編號');
    expect(found!.regex).toBe('EMP\\d{4}');
  });

  it('upsert with the same id replaces the existing entry', () => {
    let config = loadConfig();
    const v1: CustomPatternConfig = {
      id: 'c-dup',
      name: 'v1',
      category: '識別碼',
      regex: 'V1',
      example: 'V1',
      enabled: true,
    };
    const v2: CustomPatternConfig = { ...v1, name: 'v2', regex: 'V2' };
    config = upsertCustom(config, v1);
    config = upsertCustom(config, v2);
    expect(config.customPatterns).toHaveLength(1);
    expect(config.customPatterns[0].name).toBe('v2');
    expect(config.customPatterns[0].regex).toBe('V2');
  });

  it('removeCustom deletes the entry', () => {
    let config = loadConfig();
    const custom: CustomPatternConfig = {
      id: 'c-remove-me',
      name: 'temp',
      category: '識別碼',
      regex: 'TEMP',
      example: 'TEMP',
      enabled: true,
    };
    config = upsertCustom(config, custom);
    expect(config.customPatterns).toHaveLength(1);
    config = removeCustom(config, 'c-remove-me');
    expect(config.customPatterns).toHaveLength(0);
  });

  it('throws when upserting an invalid regex', () => {
    const config = loadConfig();
    const bad: CustomPatternConfig = {
      id: 'c-bad',
      name: 'bad',
      category: '識別碼',
      regex: '(',
      example: 'x',
      enabled: true,
    };
    expect(() => upsertCustom(config, bad)).toThrow();
  });
});

describe('validateRegex', () => {
  it('returns null for a valid regex', () => {
    expect(validateRegex('\\d{3}')).toBeNull();
  });

  it('returns a non-null message for an invalid regex', () => {
    expect(validateRegex('(')).not.toBeNull();
    expect(typeof validateRegex('(')).toBe('string');
  });

  it('returns a non-null message for an empty regex', () => {
    expect(validateRegex('')).not.toBeNull();
  });

  it('returns a non-null message for a regex that matches the empty string', () => {
    expect(validateRegex('a*')).not.toBeNull();
  });
});

describe('privacy: saveConfig writes only the expected shape', () => {
  it('leaves exactly one localStorage key with only version/disabledBuiltins/customPatterns fields', () => {
    let config = loadConfig();
    config = setBuiltinEnabled(config, 'email', false);
    config = upsertCustom(config, {
      id: 'c-priv',
      name: 'priv',
      category: '識別碼',
      regex: 'PRIV',
      example: 'PRIV',
      enabled: true,
    });
    saveConfig(config);

    expect(Object.keys(localStorage)).toEqual([STORAGE_KEY]);
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(new Set(Object.keys(parsed))).toEqual(
      new Set(['version', 'disabledBuiltins', 'customPatterns']),
    );
  });
});

describe('newCustomId', () => {
  it('returns "c-" followed by 6 hex chars, distinct across calls', () => {
    const id1 = newCustomId();
    const id2 = newCustomId();
    expect(id1).toMatch(/^c-[0-9a-f]{6}$/);
    expect(id2).toMatch(/^c-[0-9a-f]{6}$/);
    expect(id1).not.toBe(id2);
  });
});
