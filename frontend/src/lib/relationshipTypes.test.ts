import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_CATEGORIES,
  RELATIONSHIP_TYPES,
  categoryLabel,
  connectionLabel,
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

describe('connectionLabel', () => {
  it('keeps the plain role for ordinary links', () => {
    expect(connectionLabel('Parent', 'BIOLOGICAL', false)).toBe('Parent');
    expect(connectionLabel('Friend', null, false)).toBe('Friend');
  });

  it('names step and adoptive parents and children from either side', () => {
    expect(connectionLabel('Parent', 'STEP', false)).toBe('Step-parent');
    expect(connectionLabel('Child', 'STEP', false)).toBe('Step-child');
    expect(connectionLabel('Parent', 'ADOPTIVE', false)).toBe('Adoptive parent');
    expect(connectionLabel('Child', 'ADOPTIVE', false)).toBe('Adopted child');
  });

  it('names a former spouse', () => {
    expect(connectionLabel('Spouse', null, true)).toBe('Former spouse');
  });
});
