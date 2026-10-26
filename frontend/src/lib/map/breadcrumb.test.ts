import { describe, expect, it } from 'vitest';
import { crumbs } from './breadcrumb';

describe('crumbs', () => {
  it('lists every frame from the root to the focus', () => {
    expect(crumbs(['R', 'A', 'B', 'C', 'D'], false)).toEqual(['R', 'A', 'B', 'C', 'D']);
  });

  it('keeps up to four on a narrow screen', () => {
    expect(crumbs(['R', 'A', 'B', 'C'], true)).toEqual(['R', 'A', 'B', 'C']);
  });

  it('shortens to the root, a gap, and the last two on a narrow screen', () => {
    expect(crumbs(['R', 'A', 'B', 'C', 'D'], true)).toEqual(['R', null, 'C', 'D']);
  });
});
