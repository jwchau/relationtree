import type { GraphConnection, GraphPerson, TreeGraph } from '@/api/client';

export type Link =
  | [string, GraphConnection['type'], string]
  | [string, GraphConnection['type'], string, Partial<Pick<GraphConnection, 'parent_kind' | 'ended'>>];

/** A tree whose ids are the people's names. `[a, 'PARENT', b]` reads "a is b's parent";
 * a fourth element sets a parent kind or a former partnership.
 * `categories` sets how the tree's owner knows people; `ownerMe` names an owner's "me". */
export function tree(
  names: string[],
  links: Link[],
  birthdays: Record<string, string> = {},
  { categories = {}, ownerMe = [] }: {
    categories?: Record<string, GraphPerson['relationship_category']>;
    ownerMe?: string[];
  } = {},
): TreeGraph {
  const people: GraphPerson[] = names.map((name) => ({
    id: name,
    name,
    photo_url: null,
    birthday: birthdays[name] ?? null,
    relationship_category: categories[name] ?? null,
    is_me: false,
    is_owner_me: ownerMe.includes(name),
  }));
  const connections: GraphConnection[] = links.map(([a, type, b, extra], i) => ({
    id: `c${i}`,
    person_a_id: a,
    person_b_id: b,
    type,
    parent_kind: type === 'PARENT' ? (extra?.parent_kind ?? 'BIOLOGICAL') : null,
    ended: extra?.ended ?? false,
  }));
  return { people, connections };
}
