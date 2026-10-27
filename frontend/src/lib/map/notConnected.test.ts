import { describe, expect, it } from 'vitest';
import { mapModel } from './model';
import { notConnected } from './notConnected';
import { tree } from './testTree';

const ids = (graph: ReturnType<typeof tree>, rootId: string) =>
  notConnected(graph, mapModel(graph, rootId).ownership).map((p) => p.id);

describe('notConnected', () => {
  it('lists a person with no links at all', () => {
    const graph = tree(['A', 'B', 'Z'], [['A', 'SIBLING', 'B']]);
    expect(ids(graph, 'A')).toEqual(['Z']);
  });

  it('lists everyone in a separate group, however they are linked to each other', () => {
    const graph = tree(
      ['A', 'B', 'X', 'Y', 'Z'],
      [['A', 'PARENT', 'B'], ['X', 'SPOUSE', 'Y'], ['Y', 'PARENT', 'Z']],
    );
    expect(ids(graph, 'A')).toEqual(['X', 'Y', 'Z']);
  });

  it('counts someone reachable only through a social link as connected', () => {
    const graph = tree(['A', 'F', 'FS', 'Z'], [['A', 'FRIEND', 'F'], ['F', 'SPOUSE', 'FS']]);
    expect(ids(graph, 'A')).toEqual(['Z']);
  });

  it("counts someone placed by the category rule as connected (the root is an owner's me)", () => {
    const graph = tree(['Me', 'W', 'Z'], [], {}, { categories: { W: 'COWORKER' }, ownerMe: ['Me'] });
    expect(ids(graph, 'Me')).toEqual(['Z']);
    // From anyone else's point of view the category means nothing, so W isn't reached.
    expect(ids(graph, 'Z')).toEqual(['Me', 'W']);
  });

  it('never lists the root, even with no links', () => {
    const graph = tree(['A', 'Z'], []);
    expect(ids(graph, 'A')).toEqual(['Z']);
    expect(ids(graph, 'Z')).toEqual(['A']);
  });

  it('lists people by name, ignoring case', () => {
    const graph = tree(['A', 'zed', 'Mo', 'bo'], []);
    expect(ids(graph, 'A')).toEqual(['bo', 'Mo', 'zed']);
  });
});
