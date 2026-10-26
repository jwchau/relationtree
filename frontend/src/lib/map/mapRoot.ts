import type { TreeGraph } from '@/api/client';

export type MapRoot =
  | { kind: 'person'; id: string }
  | { kind: 'pick' }
  | { kind: 'unknown'; id: string };

/** Who the map centres on: `?root` if it's in this tree, else the user's "This is me",
 * else they pick someone. */
export function resolveRoot(graph: TreeGraph, rootParam: string | null): MapRoot {
  if (rootParam) {
    const found = graph.people.some((p) => p.id === rootParam);
    return found ? { kind: 'person', id: rootParam } : { kind: 'unknown', id: rootParam };
  }
  const me = graph.people.find((p) => p.is_me);
  return me ? { kind: 'person', id: me.id } : { kind: 'pick' };
}
