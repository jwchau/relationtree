import type { TreeGraph } from '@/api/client';
import { familyCore } from './familyCore';

/** Which frame draws each person: `owner` is the person whose frame they sit in (null for
 * the root) and `depth` is how many frames out from the root that is (design doc D7). */
export type Ownership = Map<string, { owner: string | null; depth: number }>;

export function assignOwnership(graph: TreeGraph, rootId: string): Ownership {
  const birthdays = new Map(graph.people.map((p) => [p.id, p.birthday]));
  const ownership: Ownership = new Map([[rootId, { owner: null, depth: 0 }]]);
  // Breadth-first, one ring of frames at a time, so the nearest frame always wins.
  let frontier = [rootId];
  for (let depth = 1; frontier.length > 0; depth++) {
    // Everyone this ring of frames could draw, with the best claim on each so far.
    const claims = new Map<string, { owner: string; family: boolean }>();
    const claim = (id: string, owner: string, family: boolean) => {
      if (ownership.has(id)) return;
      const current = claims.get(id);
      if (!current || (family && !current.family)) claims.set(id, { owner, family });
    };
    // Claims are made eldest owner first (then by id), and only a family claim can replace an
    // earlier one, so a remaining tie goes to the eldest.
    for (const owner of byBirthThenId(frontier, birthdays)) {
      for (const id of familyOf(graph, owner)) claim(id, owner, true);
      for (const id of socialOf(graph, owner)) claim(id, owner, false);
    }
    for (const [id, { owner }] of claims) ownership.set(id, { owner, depth });
    frontier = [...claims.keys()];
  }
  return ownership;
}

function familyOf(graph: TreeGraph, personId: string): string[] {
  const core = familyCore(graph, personId);
  return [
    ...core.parents.ids,
    ...core.spouses,
    ...core.siblings,
    ...core.children.flatMap((g) => g.children),
  ];
}

/** Eldest first, unknown birthdays last, then by id (D7's fixed tie-break). */
function byBirthThenId(ids: string[], birthdays: Map<string, string | null>): string[] {
  return [...ids].sort((x, y) => {
    const [a, b] = [birthdays.get(x) ?? null, birthdays.get(y) ?? null];
    if (a !== b) {
      if (a === null) return 1;
      if (b === null) return -1;
      return a < b ? -1 : 1;
    }
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

const SOCIAL_TYPES =new Set(['FRIEND', 'COWORKER', 'ACQUAINTANCE', 'MANAGER']);

/** Everyone linked to this person socially or at work, from either end of the link. */
function socialOf(graph: TreeGraph, personId: string): string[] {
  return graph.connections.flatMap((c) => {
    if (!SOCIAL_TYPES.has(c.type)) return [];
    if (c.person_a_id === personId) return [c.person_b_id];
    if (c.person_b_id === personId) return [c.person_a_id];
    return [];
  });
}
