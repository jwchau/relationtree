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
  parents: { ids: [], couple: false , ended: false },
  spouses: [],
  former: [],
  half: [],
  kinds: {},
  siblings: [],
  children: [],
  social: NO_SOCIAL,
  chips: new Set<string>(),
};

describe('frameFor', () => {
  it("shows a child's partner and children, with their parents and sibling as chips", () => {
    expect(frameFor(family, ownership, 'AA')).toEqual({
      ...NO_ONE,
      self: 'AA',
      parents: { ids: ['A', 'S'], couple: true , ended: false },
      siblings: ['AA2'],
      spouses: ['AAS'],
      children: [{ parents: ['AA', 'AAS'], children: ['AAA'] }],
      chips: new Set(['A', 'S', 'AA2']),
    });
  });

  it("shows a sibling's partner and children, with their parents and the root as chips", () => {
    expect(frameFor(family, ownership, 'B')).toEqual({
      ...NO_ONE,
      self: 'B',
      parents: { ids: ['P1', 'P2'], couple: true , ended: false },
      siblings: ['A'],
      spouses: ['BS'],
      children: [{ parents: ['B', 'BS'], children: ['BK'] }],
      chips: new Set(['P1', 'P2', 'A']),
    });
  });

  it("shows a parent's parents and siblings, with their partner and children as chips", () => {
    expect(frameFor(family, ownership, 'P1')).toEqual({
      ...NO_ONE,
      self: 'P1',
      parents: { ids: ['G1', 'G2'], couple: true , ended: false },
      siblings: ['U'],
      spouses: ['P2'],
      children: [{ parents: ['P1', 'P2'], children: ['A', 'B'] }],
      chips: new Set(['P2', 'A', 'B']),
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
    // A friend is a full person: their frame has their own family (D4), and A as a chip.
    expect(frameFor(graph, o, 'F')).toEqual({
      ...NO_ONE,
      self: 'F',
      spouses: ['FS'],
      social: { ...NO_SOCIAL, friends: ['A'] },
      chips: new Set(['A']),
    });
  });

  it('shows a friend who is drawn in a nearer frame as a chip in the friends band', () => {
    // F is a friend of both A and A's sibling B; A's frame is nearer, so it draws F.
    const graph = tree(['A', 'B', 'F'], [['A', 'SIBLING', 'B'], ['A', 'FRIEND', 'F'], ['B', 'FRIEND', 'F']]);
    const o = assignOwnership(graph, 'A');
    expect(frameFor(graph, o, 'A').chips).toEqual(new Set());
    const b = frameFor(graph, o, 'B');
    expect(b.social.friends).toEqual(['F']);
    expect(b.chips).toEqual(new Set(['A', 'F']));
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

  it('gives a frame to someone linked to a person drawn in yet another frame', () => {
    // F sits in A's friends band; F's coworker W is B's spouse, so B's frame draws W. A's
    // frame can't show F–W, so F's slot opens into a frame with W as a chip.
    const graph = tree(
      ['A', 'B', 'F', 'W'],
      [['A', 'SIBLING', 'B'], ['A', 'FRIEND', 'F'], ['B', 'SPOUSE', 'W'], ['F', 'COWORKER', 'W']],
    );
    const layout = frameLayouts(graph, 'A')('F');
    expect(layout?.slots.map((s) => s.id)).toEqual(expect.arrayContaining(['F', 'W', 'A']));
  });

  it('has no frame for someone who owns no one, but always one for the root', () => {
    const layoutOf = frameLayouts(family, 'A');
    expect(layoutOf('AA2')).toBeNull();
    expect(frameLayouts(tree(['A'], []), 'A')('A')?.slots.map((s) => s.id)).toEqual(['A']);
  });
});

describe('frames with half-siblings (FG-9)', () => {
  const graph = tree(
    ['A', 'P1', 'P2', 'P3', 'H'],
    [
      ['P1', 'PARENT', 'A'],
      ['P2', 'PARENT', 'A'],
      ['P2', 'PARENT', 'H'],
      ['P3', 'PARENT', 'H'],
      ['P2', 'SPOUSE', 'P3'],
    ],
    { P2: '1950-01-01', H: '1985-01-01' },
  );
  const o = assignOwnership(graph, 'A');

  it("draws the other parent as a chip in the person's frame and a slot in the shared parent's", () => {
    const layoutOf = frameLayouts(graph, 'A', o);
    const p3In = (frame: string) => layoutOf(frame)!.slots.filter((s) => s.id === 'P3');
    expect(p3In('A')).toEqual([expect.objectContaining({ chip: true })]);
    expect(p3In('P2')).toEqual([expect.not.objectContaining({ chip: true })]);
  });

  it('draws the half-sibling as a slot in the person\'s frame', () => {
    const h = frameLayouts(graph, 'A', o)('A')!.slots.find((s) => s.id === 'H');
    expect(h).toBeDefined();
    expect(h?.chip).toBeUndefined();
  });
});
