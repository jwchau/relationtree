import { describe, expect, it } from 'vitest';
import { filterAndSortPeople } from './personListFilters';
import type { PersonSummary } from '@/hooks/usePersonList';

function person(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    id: 'id',
    name: 'Person',
    relationship_category: 'FRIEND',
    context: '',
    phone: '',
    email: '',
    address: '',
    birthday: null,
    photo_url: null,
    is_me: false,
    notes: '',
    last_contacted_date: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('filterAndSortPeople', () => {
  it('filters by name, case-insensitive substring match', () => {
    const people = [person({ id: '1', name: 'Alice' }), person({ id: '2', name: 'Bob' })];
    const result = filterAndSortPeople(people, { search: 'ali', category: 'ALL' });
    expect(result.map((p) => p.id)).toEqual(['1']);
  });

  it('filters by category', () => {
    const people = [
      person({ id: '1', relationship_category: 'FAMILY' }),
      person({ id: '2', relationship_category: 'COWORKER' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'COWORKER' });
    expect(result.map((p) => p.id)).toEqual(['2']);
  });

  it('sorts never-contacted people first, then by oldest last_contacted_date', () => {
    const people = [
      person({ id: 'recent', last_contacted_date: '2026-06-01' }),
      person({ id: 'never', last_contacted_date: null }),
      person({ id: 'old', last_contacted_date: '2026-01-01' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(result.map((p) => p.id)).toEqual(['never', 'old', 'recent']);
  });

  it('does not mutate the input array', () => {
    const people = [person({ id: '1', last_contacted_date: '2026-06-01' }), person({ id: '2', last_contacted_date: '2026-01-01' })];
    const original = [...people];
    filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(people).toEqual(original);
  });
});
