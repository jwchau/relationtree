import { describe, expect, it } from 'vitest';
import { bornLine } from './card';

describe('bornLine', () => {
  it('gives the birth year and age, counting this year only once the birthday has passed', () => {
    expect(bornLine('1982-03-04', new Date(2026, 2, 3))).toBe('Born 1982 · 43');
    expect(bornLine('1982-03-04', new Date(2026, 2, 4))).toBe('Born 1982 · 44');
  });

  it('is empty without a birthday', () => {
    expect(bornLine(null, new Date(2026, 2, 4))).toBeNull();
  });
});
