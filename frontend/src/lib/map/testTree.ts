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

/** A generated tree at the product's stated scale (Q4): `people` people and `links` links,
 * the same every time. Generations of couples with children (some step or adoptive, some
 * partners former, some second partners with half-siblings), then friends, coworkers,
 * managers and acquaintances at random. Ids are "P0", "P1"... */
export function bigTree(people = 1000, links = 3000): TreeGraph {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const names = Array.from({ length: people }, (_, i) => `P${i}`);
  const birthdays: Record<string, string> = {};
  const all: Link[] = [];
  const family = Math.floor(people * 0.7);
  let next = 2;
  const couples: [number, number, number][] = [[0, 1, 1900]];
  all.push(['P0', 'SPOUSE', 'P1']);
  while (couples.length > 0 && next < family) {
    const [a, b, year] = couples.shift()!;
    for (let k = 1 + Math.floor(random() * 4); k > 0 && next < family; k--) {
      const child = next++;
      birthdays[`P${child}`] = `${year + 22 + Math.floor(random() * 15)}-0${1 + Math.floor(random() * 9)}-15`;
      const kind = random() < 0.1 ? pick(['STEP', 'ADOPTIVE'] as const) : 'BIOLOGICAL';
      all.push([`P${a}`, 'PARENT', `P${child}`, { parent_kind: kind }], [`P${b}`, 'PARENT', `P${child}`]);
      if (next >= family) break;
      const partner = next++;
      all.push([`P${child}`, 'SPOUSE', `P${partner}`, { ended: random() < 0.15 }]);
      couples.push([child, partner, year + 25]);
      if (random() < 0.1 && next < family) {
        // A second partner, and a half-sibling for the first couple's children.
        const second = next++;
        const half = next < family ? next++ : null;
        all.push([`P${child}`, 'SPOUSE', `P${second}`]);
        if (half !== null) all.push([`P${child}`, 'PARENT', `P${half}`], [`P${second}`, 'PARENT', `P${half}`]);
      }
    }
    if (random() < 0.05 && next < family) all.push([`P${a}`, 'SIBLING', `P${next++}`]);
  }
  const social = ['FRIEND', 'COWORKER', 'ACQUAINTANCE', 'MANAGER'] as const;
  while (all.length < links) {
    const [a, b] = [Math.floor(random() * people), Math.floor(random() * people)];
    if (a !== b) all.push([`P${a}`, pick(social), `P${b}`]);
  }
  return tree(names, all, birthdays);
}
