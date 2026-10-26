import { describe, expect, it } from 'vitest';
import { socialCircles } from './social';
import { tree } from './testTree';

describe('socialCircles', () => {
  it('puts friends, coworkers (managers and reports too) and acquaintances in their bands', () => {
    const graph = tree(
      ['A', 'Fz', 'Fa', 'W', 'M', 'R', 'Q', 'S', 'K'],
      [
        ['A', 'FRIEND', 'Fz'],
        ['Fa', 'FRIEND', 'A'],
        ['W', 'COWORKER', 'A'],
        ['M', 'MANAGER', 'A'], // M manages A
        ['A', 'MANAGER', 'R'], // A manages R
        ['A', 'ACQUAINTANCE', 'Q'],
        ['A', 'SPOUSE', 'S'],
        ['A', 'PARENT', 'K'],
      ],
    );
    expect(socialCircles(graph, 'A', { categoryRule: false })).toEqual({
      friends: ['Fa', 'Fz'],
      coworkers: ['M', 'R', 'W'],
      acquaintances: ['Q'],
      // Which coworkers manage this person, and which this person manages.
      managers: ['M'],
      reports: ['R'],
    });
  });

  // How the owner knows people, for people with no recorded link to them.
  const byCategory = tree(['Me', 'F', 'W', 'Q', 'Fam', 'O', 'Linked', 'Kin'], [['Me', 'COWORKER', 'Linked'], ['Me', 'PARENT', 'Kin']], {}, {
    categories: {
      Me: 'FRIEND',
      F: 'FRIEND',
      W: 'COWORKER',
      Q: 'ACQUAINTANCE',
      Fam: 'FAMILY',
      O: 'OTHER',
      Linked: 'FRIEND',
      Kin: 'ACQUAINTANCE',
    },
    ownerMe: ['Me'],
  });

  it("files people by how the owner knows them when the rule is on (the root is an owner's me)", () => {
    expect(socialCircles(byCategory, 'Me', { categoryRule: true })).toEqual({
      friends: ['F'],
      coworkers: ['Linked', 'W'],
      acquaintances: ['Q'],
      managers: [],
      reports: [],
    });
  });

  it('files no one by category when the rule is off', () => {
    expect(socialCircles(byCategory, 'Me', { categoryRule: false })).toEqual({
      friends: [],
      coworkers: ['Linked'],
      acquaintances: [],
      managers: [],
      reports: [],
    });
  });
});
