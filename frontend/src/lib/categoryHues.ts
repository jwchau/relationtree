import type { components } from '@/api/schema';
import type { RelationshipCategory } from '@/lib/relationshipTypes';

export type Hue = components['schemas']['Hue'];
export type CategoryHues = Partial<Record<string, Hue>>;

/** The hues a tree's owner can give a category, in picker order. No amber: amber marks "you". */
export const HUES: { id: Hue; label: string }[] = [
  { id: 'rose', label: 'Rose' },
  { id: 'violet', label: 'Violet' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'teal', label: 'Teal' },
  { id: 'pink', label: 'Pink' },
  { id: 'slate', label: 'Slate' },
  { id: 'none', label: 'None' },
];

/** The hue to draw a category in (a `data-hue` value), or undefined to leave it plain. */
export function hueFor(
  hues: CategoryHues | undefined,
  category: RelationshipCategory | null | undefined,
): Exclude<Hue, 'none'> | undefined {
  const hue = category ? hues?.[category] : undefined;
  return hue === 'none' ? undefined : hue;
}
