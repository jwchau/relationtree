import type { TreeGraph } from '@/api/client';
import { familyCore, type FamilyCore } from './familyCore';
import { frameLayout, type FrameLayout } from './frameLayout';
import { assignOwnership, type Ownership } from './ownership';

/** Every person's frame layout for this root, laid out on first use and then reused. A
 * frame's layout depends only on whom it owns, never on what's inside its slots (D5). Null
 * for someone who owns no one, whose slot has nothing to open into. */
export function frameLayouts(
  graph: TreeGraph,
  rootId: string,
  ownership: Ownership = assignOwnership(graph, rootId),
): (personId: string) => FrameLayout | null {
  const cache = new Map<string, FrameLayout | null>();
  return (personId) => {
    if (!cache.has(personId)) {
      const core = frameFor(graph, ownership, personId);
      const ownsSomeone =
        core.parents.ids.length + core.spouses.length + core.siblings.length + core.children.length > 0;
      cache.set(personId, ownsSomeone || personId === rootId ? frameLayout(core) : null);
    }
    return cache.get(personId)!;
  };
}

/** A person's frame: their family core, keeping only the people their frame owns, so each
 * person is drawn exactly once (design doc D2). */
export function frameFor(graph: TreeGraph, ownership: Ownership, personId: string): FamilyCore {
  const core = familyCore(graph, personId);
  const owned = (id: string) => ownership.get(id)?.owner === personId;
  const parents = core.parents.ids.filter(owned);
  return {
    parents: { ids: parents, couple: parents.length === 2 },
    self: personId,
    spouses: core.spouses.filter(owned),
    siblings: core.siblings.filter(owned),
    children: core.children
      .map((group) => ({ ...group, children: group.children.filter(owned) }))
      .filter((group) => group.children.length > 0),
  };
}
