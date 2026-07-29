export const RELATIONSHIP_TYPES = [
  'SPOUSE',
  'SIBLING',
  'FRIEND',
  'COWORKER',
  'ACQUAINTANCE',
  'PARENT',
  'MANAGER',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const LABELS: Record<RelationshipType | 'CHILD' | 'REPORT', string> = {
  SPOUSE: 'Spouse',
  SIBLING: 'Sibling',
  FRIEND: 'Friend',
  COWORKER: 'Coworker',
  ACQUAINTANCE: 'Acquaintance',
  PARENT: 'Parent',
  MANAGER: 'Manager',
  CHILD: 'Child',
  REPORT: 'Report',
};

const SYMMETRIC = new Set<RelationshipType>([
  'SPOUSE',
  'SIBLING',
  'FRIEND',
  'COWORKER',
  'ACQUAINTANCE',
]);

const INVERSE_LABEL: Partial<Record<RelationshipType, string>> = {
  PARENT: LABELS.CHILD,
  MANAGER: LABELS.REPORT,
};

export function isSymmetric(type: RelationshipType): boolean {
  return SYMMETRIC.has(type);
}

/** Label to display from the "A" side of the connection (as stored). */
export function relationshipLabel(type: RelationshipType): string {
  return LABELS[type];
}

/** Label to display from the "B" side of the connection (auto-derived inverse). */
export function inverseRelationshipLabel(type: RelationshipType): string {
  return INVERSE_LABEL[type] ?? LABELS[type];
}

export const RELATIONSHIP_CATEGORIES = [
  'FAMILY',
  'FRIEND',
  'COWORKER',
  'ACQUAINTANCE',
  'OTHER',
] as const;

export type RelationshipCategory = (typeof RELATIONSHIP_CATEGORIES)[number];

const CATEGORY_LABELS: Record<RelationshipCategory, string> = {
  FAMILY: 'Family',
  FRIEND: 'Friend',
  COWORKER: 'Coworker',
  ACQUAINTANCE: 'Acquaintance',
  OTHER: 'Other',
};

export function categoryLabel(category: RelationshipCategory): string {
  return CATEGORY_LABELS[category];
}
