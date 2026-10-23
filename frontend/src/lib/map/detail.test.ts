import { describe, expect, it } from 'vitest';
import { detailFor } from './detail';

describe('detailFor', () => {
  it('draws a dot below 12px and an avatar from 12px', () => {
    expect(detailFor(11.9)).toBe('dot');
    expect(detailFor(12)).toBe('avatar');
  });

  it('adds the name from 40px', () => {
    expect(detailFor(39.9)).toBe('avatar');
    expect(detailFor(40)).toBe('name');
  });

  it('opens into a card from 120px', () => {
    expect(detailFor(119.9)).toBe('name');
    expect(detailFor(120)).toBe('card');
  });

  it("opens into the person's own frame from 360px", () => {
    expect(detailFor(359.9)).toBe('card');
    expect(detailFor(360)).toBe('frame');
  });
});
