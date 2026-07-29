import { describe, expect, it } from 'vitest';
import { filterAndSortPeople } from './personListFilters';
import type { PersonSummary } from '@/hooks/usePersonList';

// `overrides: any`: works around an upstream Amplify Gen 2 typing bug where
// the Person model type carries a bogus `[x: string]: string[]` index
// signature (aws-amplify/amplify-js#13695, see PersonCreatePage.tsx).
function person(overrides: any): PersonSummary {
  return {
    id: overrides.id ?? 'id',
    name: 'Person',
    relationshipCategory: 'FRIEND',
    context: null,
    phone: null,
    email: null,
    address: null,
    birthday: null,
    photoKey: null,
    notes: null,
    lastContactedDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    owner: null,
    ...overrides,
  } as PersonSummary;
}

describe('filterAndSortPeople', () => {
  it('filters by name, case-insensitive substring match', () => {
    const people = [person({ id: '1', name: 'Alice' }), person({ id: '2', name: 'Bob' })];
    const result = filterAndSortPeople(people, { search: 'ali', category: 'ALL' });
    expect(result.map((p) => p.id)).toEqual(['1']);
  });

  it('filters by category', () => {
    const people = [
      person({ id: '1', relationshipCategory: 'FAMILY' }),
      person({ id: '2', relationshipCategory: 'COWORKER' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'COWORKER' });
    expect(result.map((p) => p.id)).toEqual(['2']);
  });

  it('sorts never-contacted people first, then by oldest lastContactedDate', () => {
    const people = [
      person({ id: 'recent', lastContactedDate: '2026-06-01' }),
      person({ id: 'never', lastContactedDate: null }),
      person({ id: 'old', lastContactedDate: '2026-01-01' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(result.map((p) => p.id)).toEqual(['never', 'old', 'recent']);
  });

  it('does not mutate the input array', () => {
    const people = [person({ id: '1', lastContactedDate: '2026-06-01' }), person({ id: '2', lastContactedDate: '2026-01-01' })];
    const original = [...people];
    filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(people).toEqual(original);
  });
});
