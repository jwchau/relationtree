import type { GraphPerson, TreeGraph } from '@/api/client';
import type { Ownership } from './ownership';

/** The people no frame draws, those with no path to the root, by name (FG-11). */
export function notConnected(graph: TreeGraph, ownership: Ownership): GraphPerson[] {
  return graph.people
    .filter((p) => !ownership.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1));
}
