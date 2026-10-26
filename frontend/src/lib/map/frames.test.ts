import { describe, expect, it } from 'vitest';
import { frameFor, frameLayouts } from './frames';
import { assignOwnership } from './ownership';
import { tree, type Link } from './testTree';

// The design doc's D2 family: root A with spouse S, parents P1 and P2, sibling B, and children
// AA and AA2. AA has a partner and a child; B has a partner and a child; P1 has parents and a
// sibling.
const family = tree(
  ['A', 'S', 'P1', 'P2', 'B', 'BS', 'BK', 'AA', 'AA2', 'AAS', 'AAA', 'G1', 'G2', 'U'],
  [
    ['A', 'SPOUSE', 'S'],
    ['P1', 'SPOUSE', 'P2'],
    ['P1', 'PARENT', 'A'],
    ['P2', 'PARENT', 'A'],
    ['P1', 'PARENT', 'B'],
    ['P2', 'PARENT', 'B'],
    ['B', 'SPOUSE', 'BS'],
    ['B', 'PARENT', 'BK'],
    ['BS', 'PARENT', 'BK'],
    ['A', 'PARENT', 'AA'],
    ['S', 'PARENT', 'AA'],
    ['A', 'PARENT', 'AA2'],
    ['S', 'PARENT', 'AA2'],
    ['AA', 'SPOUSE', 'AAS'],
    ['AA', 'PARENT', 'AAA'],
    ['AAS', 'PARENT', 'AAA'],
    ['G1', 'PARENT', 'P1'],
    ['G2', 'PARENT', 'P1'],
    ['G1', 'PARENT', 'U'],
    ['G2', 'PARENT', 'U'],
  ],
);
const ownership = assignOwnership(family, 'A');

const NO_SOCIAL = { friends: [], coworkers: [], acquaintances: [], managers: [], reports: [] };
const NO_ONE = {
  parents: { ids: [], couple: false },
  spouses: [],
  siblings: [],
  children: [],
  social: NO_SOCIAL,
};

describe('frameFor', () => {
  it("shows a child's partner and children, but not the root or the child's siblings", () => {
    expect(frameFor(family, ownership, 'AA')).toEqual({
      ...NO_ONE,
      self: 'AA',
      spouses: ['AAS'],
      children: [{ parents: ['AA', 'AAS'], children: ['AAA'] }],
    });
  });

  it("shows only a sibling's partner and children", () => {
    expect(frameFor(family, ownership, 'B')).toEqual({
      ...NO_ONE,
      self: 'B',
      spouses: ['BS'],
      children: [{ parents: ['B', 'BS'], children: ['BK'] }],
    });
  });

  it("shows a parent's parents and siblings, but not the root, the root's siblings or the other parent", () => {
    expect(frameFor(family, ownership, 'P1')).toEqual({
      ...NO_ONE,
      self: 'P1',
      parents: { ids: ['G1', 'G2'], couple: true },
      siblings: ['U'],
    });
  });

  it("draws a person's friends, coworkers and acquaintances in their bands", () => {
    const graph = tree(
      ['A', 'F', 'FS', 'W', 'Q'],
      [['A', 'FRIEND', 'F'], ['F', 'SPOUSE', 'FS'], ['W', 'MANAGER', 'A'], ['A', 'ACQUAINTANCE', 'Q']],
    );
    const o = assignOwnership(graph, 'A');
    expect(frameFor(graph, o, 'A')).toEqual({
      ...NO_ONE,
      self: 'A',
      social: { friends: ['F'], coworkers: ['W'], acquaintances: ['Q'], managers: ['W'], reports: [] },
    });
    // A friend is a full person: their frame has their own family (D4).
    expect(frameFor(graph, o, 'F')).toEqual({ ...NO_ONE, self: 'F', spouses: ['FS'] });
  });

  it("doesn't repeat a friend who is drawn in a nearer frame", () => {
    // F is a friend of both A and A's sibling B; A's frame is nearer, so only A's shows F.
    const graph = tree(['A', 'B', 'F'], [['A', 'SIBLING', 'B'], ['A', 'FRIEND', 'F'], ['B', 'FRIEND', 'F']]);
    const o = assignOwnership(graph, 'A');
    expect(frameFor(graph, o, 'A').social.friends).toEqual(['F']);
    expect(frameFor(graph, o, 'B').social.friends).toEqual([]);
  });

  it("files people by category only in the frame of an owner's me", () => {
    const graph = tree(['Me', 'K'], [], {}, { categories: { K: 'COWORKER' }, ownerMe: ['Me'] });
    expect(frameFor(graph, assignOwnership(graph, 'Me'), 'Me').social.coworkers).toEqual(['K']);
  });
});

describe('frameLayouts', () => {
  it("doesn't change a frame's layout when someone is added inside one of its slots", () => {
    const before = frameLayouts(family, 'A')('A');
    // A second child for AA: AA's frame grows, A's frame must not.
    const grown = tree(
      [...family.people.map((p) => p.id), 'AAB'],
      [
        ...family.connections.map((c) => [c.person_a_id, c.type, c.person_b_id] as Link),
        ['AA', 'PARENT', 'AAB'],
      ],
    );
    const layoutsAfter = frameLayouts(grown, 'A');
    expect(layoutsAfter('A')).toEqual(before);
    expect(layoutsAfter('AA')?.slots.map((s) => s.id)).toContain('AAB');
  });

  it('lays each frame out once and reuses it', () => {
    const layoutOf = frameLayouts(family, 'A');
    expect(layoutOf('P1')).toBe(layoutOf('P1'));
  });

  it('has no frame for someone who owns no one, but always one for the root', () => {
    const layoutOf = frameLayouts(family, 'A');
    expect(layoutOf('AA2')).toBeNull();
    expect(frameLayouts(tree(['A'], []), 'A')('A')?.slots.map((s) => s.id)).toEqual(['A']);
  });
});
