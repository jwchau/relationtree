import type { TreeGraph } from '@/api/client';
import { familyCore, type FamilyCore } from './familyCore';
import { frameLayout, type FrameLayout } from './frameLayout';
import { assignOwnership, type Ownership } from './ownership';
import { categoryRuleApplies, socialCircles, type SocialCircles } from './social';

/** What one person's frame draws: their family core, and their social circles as bands.
 * `chips` are the people in it whom another frame owns: they're drawn as chips that take you
 * to where they really are (D8), so each person is still drawn once. */
export interface Frame extends FamilyCore {
  social: SocialCircles;
  chips: Set<string>;
}

/** Every person's frame layout for this root, laid out on first use and then reused. A
 * frame's layout depends only on who is linked to its person, never on what's inside its
 * slots (D5). Null when the slot has nothing to open into (see hasFrame). */
export function frameLayouts(
  graph: TreeGraph,
  rootId: string,
  ownership: Ownership = assignOwnership(graph, rootId),
): (personId: string) => FrameLayout | null {
  const cache = new Map<string, FrameLayout | null>();
  return (personId) => {
    if (!cache.has(personId)) {
      const frame = frameFor(graph, ownership, personId);
      cache.set(personId, hasFrame(frame, ownership) || personId === rootId ? frameLayout(frame) : null);
    }
    return cache.get(personId)!;
  };
}

/** Whether a person's slot opens into a frame: when it owns someone, or has a link the
 * frame they sit in can't show, to someone drawn in yet another frame (FG-7). Links to the
 * people around them in that frame, or to its centre, already show there. */
function hasFrame(frame: Frame, ownership: Ownership): boolean {
  const all = [
    ...frame.parents.ids,
    ...frame.spouses,
    ...frame.siblings,
    ...frame.children.flatMap((g) => g.children),
    ...frame.social.friends,
    ...frame.social.coworkers,
    ...frame.social.acquaintances,
  ];
  const sitsIn = ownership.get(frame.self)?.owner ?? null;
  return all.some((id) => {
    if (!frame.chips.has(id)) return true;
    return id !== sitsIn && ownership.get(id)?.owner !== sitsIn;
  });
}

/** A person's frame: everyone they're linked to, with the people another frame owns marked
 * as chips, so each person is drawn exactly once (D2) and every link still shows (D8). */
export function frameFor(graph: TreeGraph, ownership: Ownership, personId: string): Frame {
  const core = familyCore(graph, personId);
  const rootId = [...ownership].find(([, o]) => o.owner === null)?.[0] ?? personId;
  const social = socialCircles(graph, personId, {
    categoryRule: categoryRuleApplies(graph, personId, rootId),
  });
  const everyone = [
    ...core.parents.ids,
    ...core.spouses,
    ...core.siblings,
    ...core.children.flatMap((g) => g.children),
    ...social.friends,
    ...social.coworkers,
    ...social.acquaintances,
  ];
  const chips = new Set(everyone.filter((id) => ownership.get(id)?.owner !== personId));
  return { ...core, social, chips };
}
