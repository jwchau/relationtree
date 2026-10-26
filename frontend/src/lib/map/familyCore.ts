import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';

/** The family rows of one person's frame (design doc D6). Every list holds person ids. */
export interface FamilyCore {
  /** Top row. `couple` is true when exactly two parents are recorded, drawn with a bar. */
  parents: { ids: string[]; couple: boolean };
  /** Middle row: the person, their spouses next to them, then their siblings. */
  self: string;
  /** Every partner: current ones first, then former ones (Q8a). */
  spouses: string[];
  /** The former partners among `spouses`, earliest relationship first. */
  former: string[];
  /** Explicit sibling links plus anyone who shares a recorded parent. */
  siblings: string[];
  /** Bottom row: children grouped by their recorded parents (this person first), eldest
   * child's group first. A child with only this person recorded is in a group of their own. */
  children: { parents: string[]; children: string[] }[];
  /** Parents and children linked to this person as step or adoptive (biological is left
   * out), for their card labels (FG-8). */
  kinds: Record<string, 'STEP' | 'ADOPTIVE'>;
}

export function familyCore(graph: TreeGraph, personId: string): FamilyCore {
  const byId = new Map(graph.people.map((p) => [p.id, p]));
  const sorted = (ids: Iterable<string>) => sortPeople([...ids], byId);
  // Step-parents go after the others, so the couple bar joins the first two (FG-8).
  const parentIds = [
    ...sorted(parentsOf(graph, personId, { step: false })),
    ...sorted(parentsOf(graph, personId, { step: true })),
  ];
  const couple = parentsOf(graph, personId, { step: false }).length === 2;
  const partners = sorted(linked(graph, personId, 'SPOUSE'));
  const ended = new Set(endedPartners(graph, personId));
  const children = childGroups(graph, personId, sorted);
  const former = byEarliest(
    partners.filter((id) => ended.has(id)),
    children,
    byId,
  );
  const siblings = new Set(linked(graph, personId, 'SIBLING'));
  for (const parent of parentIds) {
    for (const child of childrenOf(graph, parent)) siblings.add(child);
  }
  siblings.delete(personId);
  return {
    parents: { ids: parentIds, couple },
    self: personId,
    spouses: [...partners.filter((id) => !ended.has(id)), ...former],
    former,
    siblings: sorted(siblings),
    children,
    kinds: parentKinds(graph, personId),
  };
}

function childGroups(
  graph: TreeGraph,
  personId: string,
  sorted: (ids: Iterable<string>) => string[],
): FamilyCore['children'] {
  const groups = new Map<string, FamilyCore['children'][number]>();
  for (const child of sorted(childrenOf(graph, personId))) {
    // A step-parent doesn't make a child part of their couple.
    const others = sorted(parentsOf(graph, child, { step: false }).filter((p) => p !== personId));
    const parents = [personId, ...others];
    const key = parents.join(' ');
    const group = groups.get(key) ?? { parents, children: [] };
    group.children.push(child);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function parentKinds(graph: TreeGraph, personId: string): FamilyCore['kinds'] {
  const kinds: FamilyCore['kinds'] = {};
  for (const c of graph.connections) {
    if (c.type !== 'PARENT' || (c.parent_kind !== 'STEP' && c.parent_kind !== 'ADOPTIVE')) continue;
    if (c.person_b_id === personId) kinds[c.person_a_id] = c.parent_kind;
    else if (c.person_a_id === personId) kinds[c.person_b_id] = c.parent_kind;
  }
  return kinds;
}

/** Partners whose relationship with this person has ended. */
function endedPartners(graph: TreeGraph, personId: string): string[] {
  return graph.connections.flatMap((c) => {
    if (c.type !== 'SPOUSE' || !c.ended) return [];
    if (c.person_a_id === personId) return [c.person_b_id];
    if (c.person_b_id === personId) return [c.person_a_id];
    return [];
  });
}

/** Earliest relationship first. `ended` has no dates, so the eldest shared child's birthday
 * stands in for it, then the partner's name; partners with no dated shared child go last. */
function byEarliest(
  partners: string[],
  children: FamilyCore['children'],
  byId: Map<string, GraphPerson>,
): string[] {
  const eldestChild = (partner: string) => {
    const born = children
      .filter((g) => g.parents.includes(partner))
      .flatMap((g) => g.children.map((id) => byId.get(id)?.birthday ?? null))
      .filter((b): b is string => b !== null)
      .sort();
    return born[0] ?? null;
  };
  const name = (id: string) => byId.get(id)?.name ?? '';
  return [...partners].sort((x, y) => {
    const [a, b] = [eldestChild(x), eldestChild(y)];
    if (a !== b) {
      if (a === null) return 1;
      if (b === null) return -1;
      return a < b ? -1 : 1;
    }
    return name(x) < name(y) ? -1 : name(x) > name(y) ? 1 : 0;
  });
}

/** A person's parents; `step` picks only step-parents, or only the others. */
function parentsOf(graph: TreeGraph, personId: string, only?: { step: boolean }): string[] {
  return graph.connections
    .filter((c) => c.type === 'PARENT' && c.person_b_id === personId)
    .filter((c) => only === undefined || (c.parent_kind === 'STEP') === only.step)
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
export function sortPeople(ids: string[], byId: Map<string, GraphPerson>): string[] {
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
