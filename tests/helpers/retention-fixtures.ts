import type { Retention } from '../../src/core/types';

/** Typical per-rule retention used as test fixtures (身分證前 2 碼、手機後 3 碼…). */
export const SUGGESTED_RETENTION: Record<string, Retention> = {
  'zh-name': { mode: 'surname' },
  'tw-id': { mode: 'ends', head: 2, tail: 0 },
  'tw-mobile': { mode: 'ends', head: 0, tail: 3 },
  email: { mode: 'delim', delimiter: '@', side: 'after' },
  'tw-address': { mode: 'district' },
};
