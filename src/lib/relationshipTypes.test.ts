import { describe, expect, it } from 'vitest';
import {
  isSymmetric,
  relationshipLabel,
  inverseRelationshipLabel,
  categoryLabel,
} from './relationshipTypes';

describe('isSymmetric', () => {
  it('treats mutual relationship types as symmetric', () => {
    expect(isSymmetric('SPOUSE')).toBe(true);
    expect(isSymmetric('SIBLING')).toBe(true);
    expect(isSymmetric('FRIEND')).toBe(true);
    expect(isSymmetric('COWORKER')).toBe(true);
    expect(isSymmetric('ACQUAINTANCE')).toBe(true);
  });

  it('treats directional relationship types as not symmetric', () => {
    expect(isSymmetric('PARENT')).toBe(false);
    expect(isSymmetric('MANAGER')).toBe(false);
  });
});

describe('relationshipLabel', () => {
  it('renders a human-readable label for every type', () => {
    expect(relationshipLabel('SPOUSE')).toBe('Spouse');
    expect(relationshipLabel('PARENT')).toBe('Parent');
    expect(relationshipLabel('MANAGER')).toBe('Manager');
  });
});

describe('inverseRelationshipLabel', () => {
  it('derives the inverse label for directional types', () => {
    expect(inverseRelationshipLabel('PARENT')).toBe('Child');
    expect(inverseRelationshipLabel('MANAGER')).toBe('Report');
  });

  it('returns the same label for symmetric types', () => {
    expect(inverseRelationshipLabel('SPOUSE')).toBe('Spouse');
    expect(inverseRelationshipLabel('SIBLING')).toBe('Sibling');
    expect(inverseRelationshipLabel('FRIEND')).toBe('Friend');
    expect(inverseRelationshipLabel('COWORKER')).toBe('Coworker');
    expect(inverseRelationshipLabel('ACQUAINTANCE')).toBe('Acquaintance');
  });
});

describe('categoryLabel', () => {
  it('renders a human-readable label for every category', () => {
    expect(categoryLabel('FAMILY')).toBe('Family');
    expect(categoryLabel('FRIEND')).toBe('Friend');
    expect(categoryLabel('COWORKER')).toBe('Coworker');
    expect(categoryLabel('ACQUAINTANCE')).toBe('Acquaintance');
    expect(categoryLabel('OTHER')).toBe('Other');
  });
});
