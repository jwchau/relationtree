import { describe, expect, it } from 'vitest';
import { familyCore } from './familyCore';
import { tree } from './testTree';

describe('familyCore', () => {
  it('puts two parents on the top row joined by a couple bar', () => {
    const graph = tree(['A', 'P1', 'P2'], [['P1', 'PARENT', 'A'], ['P2', 'PARENT', 'A']]);
    expect(familyCore(graph, 'A').parents).toEqual({ ids: ['P1', 'P2'], couple: true });
  });

  it('draws a single recorded parent without a couple bar', () => {
    const graph = tree(['A', 'P1'], [['P1', 'PARENT', 'A']]);
    expect(familyCore(graph, 'A').parents).toEqual({ ids: ['P1'], couple: false });
  });

  it('orders people by birthday, then name, with unknown birthdays last', () => {
    const graph = tree(
      ['A', 'Zed', 'Amy', 'Bea'],
      [['Zed', 'PARENT', 'A'], ['Amy', 'PARENT', 'A'], ['Bea', 'PARENT', 'A']],
      { Zed: '1950-01-01', Bea: '1960-01-01' },
    );
    expect(familyCore(graph, 'A').parents.ids).toEqual(['Zed', 'Bea', 'Amy']);
  });

  it('puts spouses on the middle row whichever end of the link the person is on', () => {
    const graph = tree(['A', 'S1', 'S2'], [['A', 'SPOUSE', 'S1'], ['S2', 'SPOUSE', 'A']]);
    const core = familyCore(graph, 'A');
    expect(core.self).toBe('A');
    expect(core.spouses).toEqual(['S1', 'S2']);
  });

  it('lists current partners first, then former ones, earliest relationship first', () => {
    // Earliest is the eldest shared child's birthday: F2's child is older than F1's. F3 has
    // no children with A, so goes last.
    const graph = tree(
      ['A', 'C', 'F1', 'F2', 'F3', 'K1', 'K2'],
      [
        ['A', 'SPOUSE', 'F1', { ended: true }],
        ['A', 'SPOUSE', 'C'],
        ['F2', 'SPOUSE', 'A', { ended: true }],
        ['A', 'SPOUSE', 'F3', { ended: true }],
        ['A', 'PARENT', 'K1'],
        ['F1', 'PARENT', 'K1'],
        ['A', 'PARENT', 'K2'],
        ['F2', 'PARENT', 'K2'],
      ],
      { K1: '2000-01-01', K2: '1995-01-01' },
    );
    const core = familyCore(graph, 'A');
    expect(core.spouses).toEqual(['C', 'F2', 'F1', 'F3']);
    expect(core.former).toEqual(['F2', 'F1', 'F3']);
  });

  it('notes which parents and children are step or adoptive', () => {
    const graph = tree(
      ['A', 'Mum', 'Step', 'Kid', 'Adopted'],
      [
        ['Mum', 'PARENT', 'A'],
        ['Step', 'PARENT', 'A', { parent_kind: 'STEP' }],
        ['A', 'PARENT', 'Kid'],
        ['A', 'PARENT', 'Adopted', { parent_kind: 'ADOPTIVE' }],
      ],
    );
    expect(familyCore(graph, 'A').kinds).toEqual({ Step: 'STEP', Adopted: 'ADOPTIVE' });
  });

  it("doesn't let a step-parent change which couple a child belongs to", () => {
    const graph = tree(
      ['A', 'Ex', 'New', 'Kid'],
      [
        ['A', 'SPOUSE', 'Ex', { ended: true }],
        ['A', 'SPOUSE', 'New'],
        ['A', 'PARENT', 'Kid'],
        ['Ex', 'PARENT', 'Kid'],
        ['New', 'PARENT', 'Kid', { parent_kind: 'STEP' }],
      ],
    );
    expect(familyCore(graph, 'A').children).toEqual([{ parents: ['A', 'Ex'], children: ['Kid'] }]);
  });

  it('puts step-parents after the other parents, whose couple bar stays', () => {
    const graph = tree(
      ['Kid', 'Mum', 'Dad', 'Step'],
      [
        ['Step', 'PARENT', 'Kid', { parent_kind: 'STEP' }],
        ['Mum', 'PARENT', 'Kid'],
        ['Dad', 'PARENT', 'Kid'],
      ],
      { Step: '1950-01-01', Mum: '1960-01-01', Dad: '1961-01-01' },
    );
    expect(familyCore(graph, 'Kid').parents).toEqual({ ids: ['Mum', 'Dad', 'Step'], couple: true });
  });

  it('counts explicit sibling links as siblings, from either end', () => {
    const graph = tree(['A', 'B', 'C'], [['A', 'SIBLING', 'B'], ['C', 'SIBLING', 'A']]);
    expect(familyCore(graph, 'A').siblings).toEqual(['B', 'C']);
  });

  it('counts people who share a parent as siblings', () => {
    const graph = tree(
      ['A', 'B', 'P1', 'P2'],
      [['P1', 'PARENT', 'A'], ['P1', 'PARENT', 'B'], ['P2', 'PARENT', 'A']],
    );
    expect(familyCore(graph, 'A').siblings).toEqual(['B']);
  });

  it('lists a sibling once when they are both linked and share parents', () => {
    const graph = tree(
      ['A', 'B', 'P1', 'P2'],
      [
        ['A', 'SIBLING', 'B'],
        ['P1', 'PARENT', 'A'],
        ['P1', 'PARENT', 'B'],
        ['P2', 'PARENT', 'A'],
        ['P2', 'PARENT', 'B'],
      ],
    );
    expect(familyCore(graph, 'A').siblings).toEqual(['B']);
  });

  it('groups children under the couple they belong to, eldest child first', () => {
    const graph = tree(
      ['A', 'S', 'X', 'C1', 'C2', 'C3'],
      [
        ['A', 'SPOUSE', 'S'],
        ['A', 'PARENT', 'C1'],
        ['S', 'PARENT', 'C1'],
        ['A', 'PARENT', 'C2'],
        ['S', 'PARENT', 'C2'],
        ['A', 'PARENT', 'C3'],
        ['X', 'PARENT', 'C3'],
      ],
      { C1: '2010-01-01', C2: '2012-01-01', C3: '2005-01-01' },
    );
    expect(familyCore(graph, 'A').children).toEqual([
      { parents: ['A', 'X'], children: ['C3'] },
      { parents: ['A', 'S'], children: ['C1', 'C2'] },
    ]);
  });

  it('puts a child with only this person recorded as a parent in a group of their own', () => {
    const graph = tree(['A', 'S', 'C'], [['A', 'SPOUSE', 'S'], ['A', 'PARENT', 'C']]);
    expect(familyCore(graph, 'A').children).toEqual([{ parents: ['A'], children: ['C'] }]);
  });

  const EMPTY = {
    parents: { ids: [], couple: false },
    self: 'A',
    spouses: [],
    former: [],
    siblings: [],
    children: [],
    kinds: {},
  };

  it('gives a person with no family empty rows', () => {
    expect(familyCore(tree(['A', 'B'], []), 'A')).toEqual(EMPTY);
  });

  it('ignores social and work links', () => {
    const graph = tree(
      ['A', 'F', 'W', 'M', 'R', 'Q'],
      [
        ['A', 'FRIEND', 'F'],
        ['W', 'COWORKER', 'A'],
        ['M', 'MANAGER', 'A'],
        ['A', 'MANAGER', 'R'],
        ['A', 'ACQUAINTANCE', 'Q'],
      ],
    );
    expect(familyCore(graph, 'A')).toEqual(EMPTY);
  });
});
