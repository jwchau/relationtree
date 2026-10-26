import { describe, expect, it } from 'vitest';
import { mapModel } from './model';
import { tree } from './testTree';

const ash = () =>
  tree(['Robin', 'Alan', 'Beth', 'Lou'], [
    ['Alan', 'PARENT', 'Robin'],
    ['Beth', 'PARENT', 'Robin'],
    ['Alan', 'SIBLING', 'Lou'],
  ]);

describe('mapModel', () => {
  it('reuses the model for the same graph and root', () => {
    const graph = ash();
    expect(mapModel(graph, 'Robin')).toBe(mapModel(graph, 'Robin'));
  });

  it('lays out a new root afresh, and keeps the first for going back', () => {
    const graph = ash();
    const robin = mapModel(graph, 'Robin');
    const lou = mapModel(graph, 'Lou');
    expect(lou).not.toBe(robin);
    expect(lou.layoutOf('Lou')).not.toBeNull();
    expect(lou.ownership.get('Lou')?.depth).toBe(0);
    expect(mapModel(graph, 'Robin')).toBe(robin);
  });

  it('lays out again when the graph changes', () => {
    const before = mapModel(ash(), 'Robin');
    const after = mapModel(ash(), 'Robin');
    expect(after).not.toBe(before);
  });
});
