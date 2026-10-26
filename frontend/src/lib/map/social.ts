import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';
import { sortPeople } from './familyCore';

type Band = 'friends' | 'coworkers' | 'acquaintances';

/** A person's social circles, each drawn as a band around their family core (design doc D6).
 * `managers` and `reports` say which of the coworkers manage this person and which this
 * person manages, for their labels. */
export interface SocialCircles {
  friends: string[];
  coworkers: string[];
  acquaintances: string[];
  managers: string[];
  reports: string[];
}

const BAND_OF: Partial<Record<GraphConnection['type'], Band>> = {
  FRIEND: 'friends',
  COWORKER: 'coworkers',
  // Managers and reports go with coworkers, as the person page's graph groups them as "Work".
  MANAGER: 'coworkers',
  ACQUAINTANCE: 'acquaintances',
};

const BAND_OF_CATEGORY: Partial<Record<NonNullable<GraphPerson['relationship_category']>, Band>> = {
  FRIEND: 'friends',
  COWORKER: 'coworkers',
  ACQUAINTANCE: 'acquaintances',
};

/** The person's circles from their links. With `categoryRule` (the person is an owner's
 * "me"), people with no link to them at all are also filed by how the owner knows them,
 * their relationship_category; Family and Other file no one. */
export function socialCircles(
  graph: TreeGraph,
  personId: string,
  { categoryRule }: { categoryRule: boolean },
): SocialCircles {
  const bands: Record<Band, Set<string>> = {
    friends: new Set(),
    coworkers: new Set(),
    acquaintances: new Set(),
  };
  const managers = new Set<string>();
  const reports = new Set<string>();
  for (const c of graph.connections) {
    const band = BAND_OF[c.type];
    if (!band) continue;
    // "a MANAGER b" reads "a is b's manager".
    if (c.person_a_id === personId) {
      bands[band].add(c.person_b_id);
      if (c.type === 'MANAGER') reports.add(c.person_b_id);
    } else if (c.person_b_id === personId) {
      bands[band].add(c.person_a_id);
      if (c.type === 'MANAGER') managers.add(c.person_a_id);
    }
  }
  if (categoryRule) {
    const linked = new Set(
      graph.connections.flatMap((c) =>
        c.person_a_id === personId ? [c.person_b_id] : c.person_b_id === personId ? [c.person_a_id] : [],
      ),
    );
    for (const p of graph.people) {
      const band = p.relationship_category && BAND_OF_CATEGORY[p.relationship_category];
      if (band && p.id !== personId && !linked.has(p.id)) bands[band].add(p.id);
    }
  }
  const byId = new Map(graph.people.map((p) => [p.id, p]));
  const sorted = (ids: Set<string>) => sortPeople([...ids], byId);
  return {
    friends: sorted(bands.friends),
    coworkers: sorted(bands.coworkers),
    acquaintances: sorted(bands.acquaintances),
    managers: sorted(managers),
    reports: sorted(reports),
  };
}

/** Whether a frame files people by relationship_category: only the root's frame, and only
 * when the root is the "This is me" of one of the tree's owners, because the category records
 * how an owner knows someone and means nothing from anyone else's point of view. */
export function categoryRuleApplies(graph: TreeGraph, personId: string, rootId: string): boolean {
  return personId === rootId && graph.people.some((p) => p.id === personId && p.is_owner_me);
}
