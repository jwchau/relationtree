import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_CATEGORIES,
  RELATIONSHIP_TYPES,
  categoryLabel,
  relationshipLabel,
} from './relationshipTypes';

describe('relationshipLabel', () => {
  it('renders a human-readable label for every type', () => {
    expect(RELATIONSHIP_TYPES.map(relationshipLabel)).toEqual([
      'Spouse',
      'Sibling',
      'Friend',
      'Coworker',
      'Acquaintance',
      'Parent',
      'Manager',
    ]);
  });
});

describe('categoryLabel', () => {
  it('renders a human-readable label for every category', () => {
    expect(RELATIONSHIP_CATEGORIES.map(categoryLabel)).toEqual([
      'Family',
      'Friend',
      'Coworker',
      'Acquaintance',
      'Other',
    ]);
  });
});
