import { describe, expect, it } from 'vitest';
import {
  CONNECTION_CHOICES,
  RELATIONSHIP_CATEGORIES,
  RELATIONSHIP_TYPES,
  categoryLabel,
  connectionChoiceLabel,
  connectionFromChoice,
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

describe('connectionChoice', () => {
  it('offers Child alongside Parent when adding a connection', () => {
    expect(CONNECTION_CHOICES).toContain('PARENT');
    expect(CONNECTION_CHOICES).toContain('CHILD');
  });

  it('names Parent and Child by direction, so it is clear who is whose', () => {
    expect(connectionChoiceLabel('PARENT')).toBe('Parent of…');
    expect(connectionChoiceLabel('CHILD')).toBe('Child of…');
    expect(connectionChoiceLabel('FRIEND')).toBe('Friend');
  });

  it('saves Child as the other person being the parent', () => {
    expect(connectionFromChoice('CHILD', 'me', 'them')).toEqual({
      personAId: 'them',
      personBId: 'me',
      type: 'PARENT',
    });
  });

  it('saves other choices with this person first', () => {
    expect(connectionFromChoice('PARENT', 'me', 'them')).toEqual({
      personAId: 'me',
      personBId: 'them',
      type: 'PARENT',
    });
    expect(connectionFromChoice('FRIEND', 'me', 'them').type).toBe('FRIEND');
  });
});
