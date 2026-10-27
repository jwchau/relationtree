import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';

/** Lookups built once per graph, so working out a person's family or circles reads only
 * their own links instead of every link in the tree (FG-12: at 1,000 people and 3,000
 * links, plain scans made the ownership walk take about 370 ms). */
export interface GraphIndex {
  byId: Map<string, GraphPerson>;
  /** Each person's links, in the graph's order. */
  linksOf: (personId: string) => readonly GraphConnection[];
}

// Per graph object, like mapModel's cache: a refetch is a new object and gets a new index.
const cache = new WeakMap<TreeGraph, GraphIndex>();
const NONE: readonly GraphConnection[] = [];

export function graphIndex(graph: TreeGraph): GraphIndex {
  let index = cache.get(graph);
  if (!index) {
    const links = new Map<string, GraphConnection[]>();
    const add = (id: string, c: GraphConnection) => {
      const list = links.get(id);
      if (list) list.push(c);
      else links.set(id, [c]);
    };
    for (const c of graph.connections) {
      add(c.person_a_id, c);
      if (c.person_b_id !== c.person_a_id) add(c.person_b_id, c);
    }
    index = {
      byId: new Map(graph.people.map((p) => [p.id, p])),
      linksOf: (personId) => links.get(personId) ?? NONE,
    };
    cache.set(graph, index);
  }
  return index;
}
