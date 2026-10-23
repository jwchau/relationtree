import { describe, expect, it } from 'vitest';
import type { GraphPerson, TreeGraph } from '@/api/client';
import { resolveRoot } from './mapRoot';

function person(id: string, is_me = false): GraphPerson {
  return { id, name: id, photo_url: null, birthday: null, relationship_category: null, is_me };
}

const graph = (people: GraphPerson[]): TreeGraph => ({ people, connections: [] });

describe('resolveRoot', () => {
  it('uses ?root when that person is in the tree', () => {
    expect(resolveRoot(graph([person('A', true), person('B')]), 'B')).toEqual({ kind: 'person', id: 'B' });
  });

  it('falls back to the "This is me" person', () => {
    expect(resolveRoot(graph([person('A'), person('B', true)]), null)).toEqual({ kind: 'person', id: 'B' });
  });

  it('asks for a pick when there is no ?root and no "This is me"', () => {
    expect(resolveRoot(graph([person('A')]), null)).toEqual({ kind: 'pick' });
  });

  it('reports a ?root that is not in this tree', () => {
    expect(resolveRoot(graph([person('A', true)]), 'Z')).toEqual({ kind: 'unknown', id: 'Z' });
  });
});
