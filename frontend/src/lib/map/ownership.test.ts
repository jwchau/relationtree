import { describe, expect, it } from 'vitest';
import { assignOwnership } from './ownership';
import { tree } from './testTree';

/** owner per person, for compact assertions. */
const owners = (o: ReturnType<typeof assignOwnership>) =>
  Object.fromEntries([...o].map(([id, { owner }]) => [id, owner]));

describe('assignOwnership', () => {
  it("gives the root's family core to the root, at depth 1", () => {
    const graph = tree(
      ['A', 'P1', 'P2', 'S', 'B', 'C'],
      [['P1', 'PARENT', 'A'], ['P2', 'PARENT', 'A'], ['A', 'SPOUSE', 'S'], ['A', 'SIBLING', 'B'], ['A', 'PARENT', 'C']],
    );
    const o = assignOwnership(graph, 'A');
    expect(o.get('A')).toEqual({ owner: null, depth: 0 });
    expect(owners(o)).toEqual({ A: null, P1: 'A', P2: 'A', S: 'A', B: 'A', C: 'A' });
    expect(o.get('P1')?.depth).toBe(1);
  });

  it("gives a parent's parents and siblings to that parent, at depth 2", () => {
    const graph = tree(
      ['A', 'P1', 'G1', 'G2', 'U'],
      [['P1', 'PARENT', 'A'], ['G1', 'PARENT', 'P1'], ['G2', 'PARENT', 'P1'], ['G1', 'PARENT', 'U']],
    );
    const o = assignOwnership(graph, 'A');
    expect(owners(o)).toEqual({ A: null, P1: 'A', G1: 'P1', G2: 'P1', U: 'P1' });
    expect(o.get('U')?.depth).toBe(2);
  });

  it('lets the nearest frame win', () => {
    // X is A's child (one frame out) and also the spouse of A's sibling B (two frames out).
    const graph = tree(['A', 'B', 'X'], [['A', 'SIBLING', 'B'], ['A', 'PARENT', 'X'], ['B', 'SPOUSE', 'X']]);
    expect(assignOwnership(graph, 'A').get('X')).toEqual({ owner: 'A', depth: 1 });
  });

  it("counts social links: the root's friend is the root's, and the friend's family is the friend's", () => {
    const graph = tree(
      ['A', 'F', 'FS', 'W', 'M', 'R'],
      [['A', 'FRIEND', 'F'], ['F', 'SPOUSE', 'FS'], ['W', 'COWORKER', 'A'], ['M', 'MANAGER', 'A'], ['A', 'MANAGER', 'R']],
    );
    expect(owners(assignOwnership(graph, 'A'))).toEqual({ A: null, F: 'A', FS: 'F', W: 'A', M: 'A', R: 'A' });
  });

  it('prefers a family link over a social one at the same distance', () => {
    // X is sibling B's child and sibling C's friend. C is older, so the walk reaches C first.
    const graph = tree(
      ['A', 'B', 'C', 'X'],
      [['A', 'SIBLING', 'B'], ['A', 'SIBLING', 'C'], ['B', 'PARENT', 'X'], ['C', 'FRIEND', 'X']],
      { B: '1985-01-01', C: '1980-01-01' },
    );
    expect(assignOwnership(graph, 'A').get('X')).toEqual({ owner: 'B', depth: 2 });
  });

  it.each([
    ['the elder owner', { S: '1990-01-01', B: '1985-01-01' }],
    ['the lower id when neither has a birthday', {}],
  ])('breaks a remaining tie in favour of %s', (_, birthdays: Record<string, string>) => {
    // X is the friend of both A's spouse S and A's sibling B.
    const graph = tree(
      ['A', 'S', 'B', 'X'],
      [['A', 'SPOUSE', 'S'], ['A', 'SIBLING', 'B'], ['S', 'FRIEND', 'X'], ['B', 'FRIEND', 'X']],
      birthdays,
    );
    expect(assignOwnership(graph, 'A').get('X')?.owner).toBe('B');
  });

  it('gives the same result whatever order the people and connections come in', () => {
    const graph = tree(
      ['A', 'S', 'B', 'C', 'X', 'Y', 'P1', 'G1'],
      [
        ['A', 'SPOUSE', 'S'],
        ['A', 'SIBLING', 'B'],
        ['A', 'SIBLING', 'C'],
        ['S', 'FRIEND', 'X'],
        ['B', 'FRIEND', 'X'],
        ['C', 'PARENT', 'Y'],
        ['B', 'COWORKER', 'Y'],
        ['P1', 'PARENT', 'A'],
        ['G1', 'PARENT', 'P1'],
        ['S', 'ACQUAINTANCE', 'G1'],
      ],
    );
    const expected = owners(assignOwnership(graph, 'A'));
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = {
        people: shuffle(graph.people, seed),
        connections: shuffle(graph.connections, seed * 7),
      };
      expect(owners(assignOwnership(shuffled, 'A'))).toEqual(expected);
    }
  });

  it('leaves people with no path to the root unowned', () => {
    const graph = tree(['A', 'B', 'L', 'M'], [['A', 'SIBLING', 'B'], ['L', 'FRIEND', 'M']]);
    expect(owners(assignOwnership(graph, 'A'))).toEqual({ A: null, B: 'A' });
  });
});

/** A deterministic shuffle, so a failure can be reproduced. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('assignOwnership with the category rule', () => {
  // F is known to the owner as a friend but has no recorded link. X is Me's sibling.
  const graph = tree(['Me', 'F', 'X'], [['Me', 'SIBLING', 'X']], {}, {
    categories: { F: 'FRIEND' },
    ownerMe: ['Me'],
  });

  it("gives people filed by category to the root when the root is an owner's me", () => {
    expect(assignOwnership(graph, 'Me').get('F')).toEqual({ owner: 'Me', depth: 1 });
  });

  it('places no one by category around any other root', () => {
    // From X, Me is a sibling; Me's frame doesn't apply the rule, so F has no path.
    expect(assignOwnership(graph, 'X').has('F')).toBe(false);
  });
});

describe('assignOwnership with half-siblings (FG-9)', () => {
  it("draws a half-sibling in the person's frame, and their other parent in the shared parent's", () => {
    const graph = tree(
      ['A', 'P1', 'P2', 'P3', 'H'],
      [
        ['P1', 'PARENT', 'A'],
        ['P2', 'PARENT', 'A'],
        ['P2', 'PARENT', 'H'],
        ['P3', 'PARENT', 'H'],
        ['P2', 'SPOUSE', 'P3'],
      ],
      // Both P2 (spouse) and H (child) claim P3; the elder, P2, wins (D7).
      { P2: '1950-01-01', H: '1985-01-01' },
    );
    const o = assignOwnership(graph, 'A');
    expect(o.get('H')).toEqual({ owner: 'A', depth: 1 });
    expect(o.get('P3')?.owner).toBe('P2');
  });
});
