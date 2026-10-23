import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';

/** The family rows of one person's frame (design doc D6). Every list holds person ids. */
export interface FamilyCore {
  /** Top row. `couple` is true when exactly two parents are recorded, drawn with a bar. */
  parents: { ids: string[]; couple: boolean };
  /** Middle row: the person, their spouses next to them, then their siblings. */
  self: string;
  spouses: string[];
  /** Explicit sibling links plus anyone who shares a recorded parent. */
  siblings: string[];
  /** Bottom row: children grouped by their recorded parents (this person first), eldest
   * child's group first. A child with only this person recorded is in a group of their own. */
  children: { parents: string[]; children: string[] }[];
}

export function familyCore(graph: TreeGraph, personId: string): FamilyCore {
  const byId = new Map(graph.people.map((p) => [p.id, p]));
  const sorted = (ids: Iterable<string>) => sortPeople([...ids], byId);
  const parentIds = sorted(parentsOf(graph, personId));
  const spouses = sorted(linked(graph, personId, 'SPOUSE'));
  const siblings = new Set(linked(graph, personId, 'SIBLING'));
  for (const parent of parentIds) {
    for (const child of childrenOf(graph, parent)) siblings.add(child);
  }
  siblings.delete(personId);
  return {
    parents: { ids: parentIds, couple: parentIds.length === 2 },
    self: personId,
    spouses,
    siblings: sorted(siblings),
    children: childGroups(graph, personId, sorted),
  };
}

function childGroups(
  graph: TreeGraph,
  personId: string,
  sorted: (ids: Iterable<string>) => string[],
): FamilyCore['children'] {
  const groups = new Map<string, FamilyCore['children'][number]>();
  for (const child of sorted(childrenOf(graph, personId))) {
    const others = sorted(parentsOf(graph, child).filter((p) => p !== personId));
    const parents = [personId, ...others];
    const key = parents.join(' ');
    const group = groups.get(key) ?? { parents, children: [] };
    group.children.push(child);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function parentsOf(graph: TreeGraph, personId: string): string[] {
  return graph.connections
    .filter((c) => c.type === 'PARENT' && c.person_b_id === personId)
    .map((c) => c.person_a_id);
}

function childrenOf(graph: TreeGraph, personId: string): string[] {
  return graph.connections
    .filter((c) => c.type === 'PARENT' && c.person_a_id === personId)
    .map((c) => c.person_b_id);
}

/** The other ends of this person's links of a symmetric type. */
function linked(graph: TreeGraph, personId: string, type: GraphConnection['type']): string[] {
  return graph.connections.flatMap((c) => {
    if (c.type !== type) return [];
    if (c.person_a_id === personId) return [c.person_b_id];
    if (c.person_b_id === personId) return [c.person_a_id];
    return [];
  });
}

/** Eldest first, then by name, then id, so the order is the same on every render. Unknown
 * birthdays go last. */
function sortPeople(ids: string[], byId: Map<string, GraphPerson>): string[] {
  const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
  return ids.sort((x, y) => {
    const [a, b] = [byId.get(x), byId.get(y)];
    const [aBorn, bBorn] = [a?.birthday ?? null, b?.birthday ?? null];
    if (aBorn !== bBorn) {
      if (aBorn === null) return 1;
      if (bBorn === null) return -1;
      return compare(aBorn, bBorn);
    }
    return compare(a?.name ?? '', b?.name ?? '') || compare(x, y);
  });
}
