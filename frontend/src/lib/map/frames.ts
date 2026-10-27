import type { TreeGraph } from '@/api/client';
import { familyCore, firstDegree, type FamilyCore } from './familyCore';
import { frameLayout, overflowLayout, type BandKind, type FrameLayout } from './frameLayout';
import { capBand, parseOverflowId } from './overflow';
import { assignOwnership, type Ownership } from './ownership';
import { categoryRuleApplies, socialCircles, type SocialCircles } from './social';

/** What one person's frame draws: their family core, and their social circles as bands.
 * `chips` are the people in it whom another frame owns: they're drawn as chips that take you
 * to where they really are (D8), so each person is still drawn once. */
export interface Frame extends FamilyCore {
  social: SocialCircles;
  chips: Set<string>;
  /** Each band's people past the cap, in name order; the band shows a tile for them (FG-10). */
  overflow: Partial<Record<BandKind, string[]>>;
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
      const over = parseOverflowId(personId);
      if (over) {
        const owner = frameFor(graph, ownership, over.owner);
        const rest = owner.overflow[over.band];
        cache.set(personId, rest ? overflowLayout(over.band, rest, owner.social, owner.chips) : null);
        return cache.get(personId)!;
      }
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
    ...firstDegree(frame),
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
    ...firstDegree(core),
    // A half-sibling's other parent: never this frame's, so always a chip (FG-9).
    ...core.half.map((g) => g.partner),
    ...social.friends,
    ...social.coworkers,
    ...social.acquaintances,
  ];
  const chips = new Set(everyone.filter((id) => ownership.get(id)?.owner !== personId));
  // Crowded bands keep 23 and a "+N more" tile; the rest go to the band's overflow frame.
  const names = new Map(graph.people.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? '';
  const overflow: Frame['overflow'] = {};
  const capped = { ...social };
  for (const band of ['friends', 'coworkers', 'acquaintances'] as const) {
    const { shown, rest } = capBand(personId, band, social[band], nameOf);
    capped[band] = shown;
    if (rest.length > 0) overflow[band] = rest;
  }
  return { ...core, social: capped, chips, overflow };
}
