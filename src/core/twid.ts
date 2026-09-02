const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18,
  K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27,
  U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

/**
 * Taiwan unified business number (統一編號) checksum. Weights 1,2,1,2,1,2,4,1; each product's digits
 * are summed; valid when the total is a multiple of 5 (rule since 2023), or when the 7th digit is 7
 * and total + 1 is a multiple of 5.
 */
export function isValidTaxId(id: string): boolean {
  if (!/^\d{8}$/.test(id)) return false;
  const w = [1, 2, 1, 2, 1, 2, 4, 1];
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const p = Number(id[i]) * w[i];
    total += Math.floor(p / 10) + (p % 10);
  }
  return total % 5 === 0 || (id[6] === '7' && (total + 1) % 5 === 0);
}

/** Taiwan national ID checksum (e.g. A123456789). */
export function isValidTwId(id: string): boolean {
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false;
  const n = LETTER_VALUES[id[0]];
  const digits = id.slice(1).split('').map(Number);
  let sum = Math.floor(n / 10) + (n % 10) * 9;
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
  sum += digits[8];
  return sum % 10 === 0;
}
