import { describe, expect, it } from 'vitest';
import { embeddedHint, embeddedZoomFilter } from './embedded';

const touch = (type: string, fingers: number) => ({ type, touches: { length: fingers } });
const wheel = (keys: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ type: 'wheel', ...keys });

describe('embeddedZoomFilter', () => {
  it('leaves a plain wheel to scroll the page', () => {
    expect(embeddedZoomFilter(wheel())).toBe(false);
  });

  it('zooms on ctrl + wheel, which is also how a trackpad pinch arrives', () => {
    expect(embeddedZoomFilter(wheel({ ctrlKey: true }))).toBe(true);
  });

  it('zooms on ⌘ + wheel', () => {
    expect(embeddedZoomFilter(wheel({ metaKey: true }))).toBe(true);
  });

  it('leaves a one-finger touch to scroll the page', () => {
    expect(embeddedZoomFilter(touch('touchstart', 1))).toBe(false);
  });

  it('moves the map with two fingers', () => {
    expect(embeddedZoomFilter(touch('touchstart', 2))).toBe(true);
  });

  it('drags the map with the main mouse button', () => {
    expect(embeddedZoomFilter({ type: 'mousedown', button: 0 })).toBe(true);
  });

  it('ignores the other mouse buttons, as d3-zoom does', () => {
    expect(embeddedZoomFilter({ type: 'mousedown', button: 2 })).toBe(false);
  });

  it('zooms in on a double-click', () => {
    expect(embeddedZoomFilter({ type: 'dblclick', button: 0 })).toBe(true);
  });
});

describe('embeddedHint', () => {
  it('suggests ctrl/⌘ when a plain wheel scrolls past the map', () => {
    expect(embeddedHint(wheel())).toBe('scroll');
  });

  it('says nothing while ctrl/⌘ + wheel zooms', () => {
    expect(embeddedHint(wheel({ ctrlKey: true }))).toBeNull();
    expect(embeddedHint(wheel({ metaKey: true }))).toBeNull();
  });

  it('suggests two fingers when one finger swipes across the map', () => {
    expect(embeddedHint(touch('touchmove', 1))).toBe('touch');
  });

  it('says nothing while two fingers move the map', () => {
    expect(embeddedHint(touch('touchmove', 2))).toBeNull();
  });

  it('says nothing for a tap or the mouse', () => {
    expect(embeddedHint(touch('touchstart', 1))).toBeNull();
    expect(embeddedHint({ type: 'mousedown', button: 0 })).toBeNull();
  });
});
