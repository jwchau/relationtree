import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';

export type Link = [string, GraphConnection['type'], string];

/** A tree whose ids are the people's names. `[a, 'PARENT', b]` reads "a is b's parent". */
export function tree(names: string[], links: Link[], birthdays: Record<string, string> = {}): TreeGraph {
  const people: GraphPerson[] = names.map((name) => ({
    id: name,
    name,
    photo_url: null,
    birthday: birthdays[name] ?? null,
    relationship_category: null,
    is_me: false,
  }));
  const connections: GraphConnection[] = links.map(([a, type, b], i) => ({
    id: `c${i}`,
    person_a_id: a,
    person_b_id: b,
    type,
  }));
  return { people, connections };
}
