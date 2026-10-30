import type { components } from '@/api/schema';

// Display labels for dropdowns. Which label a connection shows from each side (e.g. Parent vs
// Child) is decided by the API, see backend/relationtree/relationships.py.

export type RelationshipType = components['schemas']['RelationshipType'];
export type RelationshipCategory = components['schemas']['RelationshipCategory'];
export type ParentKind = components['schemas']['ParentKind'];

const PARENT_KIND_LABELS: Record<ParentKind, string> = {
  BIOLOGICAL: 'Biological',
  ADOPTIVE: 'Adoptive',
  STEP: 'Step',
};

export const PARENT_KINDS = Object.keys(PARENT_KIND_LABELS) as ParentKind[];

export function parentKindLabel(kind: ParentKind): string {
  return PARENT_KIND_LABELS[kind];
}

/** How a person's page names a connection: the API's plain role ("Parent", "Child",
 * "Spouse"), made specific for step, adoptive and former links (FG-8). */
export function connectionLabel(label: string, parentKind: ParentKind | null, ended: boolean): string {
  if (parentKind === 'STEP' && (label === 'Parent' || label === 'Child')) return `Step-${label.toLowerCase()}`;
  if (parentKind === 'ADOPTIVE' && label === 'Parent') return 'Adoptive parent';
  if (parentKind === 'ADOPTIVE' && label === 'Child') return 'Adopted child';
  if (ended && label === 'Spouse') return 'Former spouse';
  return label;
}

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

/** What Add connection offers: every type, plus Child, which is a parent link the other way. */
export type ConnectionChoice = RelationshipType | 'CHILD';

export const CONNECTION_CHOICES: ConnectionChoice[] = RELATIONSHIP_TYPES.flatMap((type) =>
  type === 'PARENT' ? [type, 'CHILD' as const] : [type],
);

/** The role this person takes: "Child" for CHILD, otherwise the type's label. */
export function connectionChoiceRole(choice: ConnectionChoice): string {
  return choice === 'CHILD' ? 'Child' : relationshipLabel(choice);
}

/** The dropdown label. Parent and Child say "of…" so it's clear which way the link points. */
export function connectionChoiceLabel(choice: ConnectionChoice): string {
  const role = connectionChoiceRole(choice);
  return choice === 'PARENT' || choice === 'CHILD' ? `${role} of…` : role;
}

export function connectionChoiceType(choice: ConnectionChoice): RelationshipType {
  return choice === 'CHILD' ? 'PARENT' : choice;
}

/** The link to save when `personId` is the chosen role of `otherId`. */
export function connectionFromChoice(choice: ConnectionChoice, personId: string, otherId: string) {
  const type = connectionChoiceType(choice);
  return choice === 'CHILD'
    ? { personAId: otherId, personBId: personId, type }
    : { personAId: personId, personBId: otherId, type };
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
