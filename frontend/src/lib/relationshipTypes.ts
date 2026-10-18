import type { components } from '@/api/schema';

// Display labels for dropdowns. Which label a connection shows from each side (e.g. Parent vs
// Child) is decided by the API, see backend/relationtree/relationships.py.

export type RelationshipType = components['schemas']['RelationshipType'];
export type RelationshipCategory = components['schemas']['RelationshipCategory'];

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  SPOUSE: 'Spouse',
  SIBLING: 'Sibling',
  FRIEND: 'Friend',
  COWORKER: 'Coworker',
  ACQUAINTANCE: 'Acquaintance',
  PARENT: 'Parent',
  MANAGER: 'Manager',
};

export const RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_LABELS) as RelationshipType[];

export function relationshipLabel(type: RelationshipType): string {
  return RELATIONSHIP_LABELS[type];
}

const CATEGORY_LABELS: Record<RelationshipCategory, string> = {
  FAMILY: 'Family',
  FRIEND: 'Friend',
  COWORKER: 'Coworker',
  ACQUAINTANCE: 'Acquaintance',
  OTHER: 'Other',
};

export const RELATIONSHIP_CATEGORIES = Object.keys(CATEGORY_LABELS) as RelationshipCategory[];

export function categoryLabel(category: RelationshipCategory): string {
  return CATEGORY_LABELS[category];
}
