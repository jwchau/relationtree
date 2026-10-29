import { describe, expect, it } from 'vitest';
import { HUES, hueFor } from './categoryHues';

const hues = { FAMILY: 'rose', FRIEND: 'violet', COWORKER: 'blue', ACQUAINTANCE: 'green', OTHER: 'none' } as const;

describe('hueFor', () => {
  it("gives a category the tree's hue for it", () => {
    expect(hueFor(hues, 'FRIEND')).toBe('violet');
  });

  it('gives no hue when there is no category, the category is set to none, or no tree', () => {
    expect(hueFor(hues, null)).toBeUndefined();
    expect(hueFor(hues, 'OTHER')).toBeUndefined();
    expect(hueFor(undefined, 'FRIEND')).toBeUndefined();
  });
});

describe('HUES', () => {
  it('offers every hue but amber, which marks "you", with None last', () => {
    expect(HUES.map((h) => h.id)).toEqual(['rose', 'violet', 'blue', 'green', 'teal', 'pink', 'slate', 'none']);
  });
});
