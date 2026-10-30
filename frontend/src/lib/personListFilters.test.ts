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
    photo_original_url: null,
    is_me: false,
    tree_id: 'tree-1',
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

  it('sorts by name when no sort is given', () => {
    const people = [person({ id: 'bob', name: 'Bob' }), person({ id: 'alice', name: 'Alice' })];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(result.map((p) => p.id)).toEqual(['alice', 'bob']);
  });

  it('sorts never-contacted people first, then by oldest last_contacted_date, when sort is stalest', () => {
    const people = [
      person({ id: 'recent', last_contacted_date: '2026-06-01' }),
      person({ id: 'never', last_contacted_date: null }),
      person({ id: 'old', last_contacted_date: '2026-01-01' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL', sort: 'stalest' });
    expect(result.map((p) => p.id)).toEqual(['never', 'old', 'recent']);
  });

  it('sorts most recently contacted first, never-contacted last, when sort is recent', () => {
    const people = [
      person({ id: 'old', last_contacted_date: '2026-01-01' }),
      person({ id: 'never', last_contacted_date: null }),
      person({ id: 'recent', last_contacted_date: '2026-06-01' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL', sort: 'recent' });
    expect(result.map((p) => p.id)).toEqual(['recent', 'old', 'never']);
  });

  it('sorts by name A-Z ignoring case when sort is name-asc', () => {
    const people = [
      person({ id: 'bob', name: 'Bob' }),
      person({ id: 'carol', name: 'carol' }),
      person({ id: 'alice', name: 'alice' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL', sort: 'name-asc' });
    expect(result.map((p) => p.id)).toEqual(['alice', 'bob', 'carol']);
  });

  it('sorts by name Z-A when sort is name-desc', () => {
    const people = [
      person({ id: 'bob', name: 'Bob' }),
      person({ id: 'carol', name: 'carol' }),
      person({ id: 'alice', name: 'alice' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL', sort: 'name-desc' });
    expect(result.map((p) => p.id)).toEqual(['carol', 'bob', 'alice']);
  });

  it('sorts most recently added first when sort is newest', () => {
    const people = [
      person({ id: 'mid', created_at: '2026-03-01T00:00:00Z' }),
      person({ id: 'new', created_at: '2026-09-01T00:00:00Z' }),
      person({ id: 'old', created_at: '2025-12-01T00:00:00Z' }),
    ];
    const result = filterAndSortPeople(people, { search: '', category: 'ALL', sort: 'newest' });
    expect(result.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });

  it('sorts by next birthday from today, today first, no birthday last, when sort is birthday', () => {
    const people = [
      person({ id: 'none', birthday: null }),
      person({ id: 'yesterday', birthday: '1970-10-28' }),
      person({ id: 'january', birthday: '2000-01-15' }),
      person({ id: 'today', birthday: '1990-10-29' }),
      person({ id: 'next-week', birthday: '1985-11-05' }),
    ];
    const result = filterAndSortPeople(people, {
      search: '',
      category: 'ALL',
      sort: 'birthday',
      today: new Date(2026, 9, 29),
    });
    expect(result.map((p) => p.id)).toEqual(['today', 'next-week', 'january', 'yesterday', 'none']);
  });

  it('counts a Feb 29 birthday as Mar 1 in a non-leap year', () => {
    const people = [
      person({ id: 'leap', birthday: '1992-02-29' }),
      person({ id: 'mar-2', birthday: '1990-03-02' }),
      person({ id: 'feb-28', birthday: '1991-02-28' }),
    ];
    const result = filterAndSortPeople(people, {
      search: '',
      category: 'ALL',
      sort: 'birthday',
      today: new Date(2027, 1, 28, 12),
    });
    // Feb 28, 2027 is not a leap year: feb-28 is today, the leap-day birthday is tomorrow.
    expect(result.map((p) => p.id)).toEqual(['feb-28', 'leap', 'mar-2']);
  });

  it('sorts only the people that pass the search and category filters', () => {
    const people = [
      person({ id: 'sam-friend', name: 'Sam', relationship_category: 'FRIEND' }),
      person({ id: 'sally', name: 'Sally', relationship_category: 'FAMILY' }),
      person({ id: 'bob', name: 'Bob', relationship_category: 'FAMILY' }),
      person({ id: 'samantha', name: 'Samantha', relationship_category: 'FAMILY' }),
    ];
    const result = filterAndSortPeople(people, { search: 'sa', category: 'FAMILY', sort: 'name-desc' });
    expect(result.map((p) => p.id)).toEqual(['samantha', 'sally']);
  });

  it('does not mutate the input array', () => {
    const people = [person({ id: '1', last_contacted_date: '2026-06-01' }), person({ id: '2', last_contacted_date: '2026-01-01' })];
    const original = [...people];
    filterAndSortPeople(people, { search: '', category: 'ALL' });
    expect(people).toEqual(original);
  });
});
