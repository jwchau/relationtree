import type { TreeGraph } from '@/api/client';
import { familyCore, type FamilyCore } from './familyCore';
import { frameLayout, type FrameLayout } from './frameLayout';
import { assignOwnership, type Ownership } from './ownership';
import { categoryRuleApplies, socialCircles, type SocialCircles } from './social';

/** What one person's frame draws: their family core, and their social circles as bands. */
export interface Frame extends FamilyCore {
  social: SocialCircles;
}

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
      const frame = frameFor(graph, ownership, personId);
      const { friends, coworkers, acquaintances } = frame.social;
      const ownsSomeone =
        frame.parents.ids.length +
          frame.spouses.length +
          frame.siblings.length +
          frame.children.length +
          friends.length +
          coworkers.length +
          acquaintances.length >
        0;
      cache.set(personId, ownsSomeone || personId === rootId ? frameLayout(frame) : null);
    }
    return cache.get(personId)!;
  };
}

/** A person's frame, keeping only the people their frame owns, so each person is drawn
 * exactly once (design doc D2). */
export function frameFor(graph: TreeGraph, ownership: Ownership, personId: string): Frame {
  const core = familyCore(graph, personId);
  const owned = (id: string) => ownership.get(id)?.owner === personId;
  const parents = core.parents.ids.filter(owned);
  const rootId = [...ownership].find(([, o]) => o.owner === null)?.[0] ?? personId;
  const circles = socialCircles(graph, personId, {
    categoryRule: categoryRuleApplies(graph, personId, rootId),
  });
  return {
    parents: { ids: parents, couple: parents.length === 2 },
    self: personId,
    spouses: core.spouses.filter(owned),
    siblings: core.siblings.filter(owned),
    children: core.children
      .map((group) => ({ ...group, children: group.children.filter(owned) }))
      .filter((group) => group.children.length > 0),
    social: {
      friends: circles.friends.filter(owned),
      coworkers: circles.coworkers.filter(owned),
      acquaintances: circles.acquaintances.filter(owned),
      managers: circles.managers.filter(owned),
      reports: circles.reports.filter(owned),
    },
  };
}
