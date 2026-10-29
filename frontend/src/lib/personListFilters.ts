import type { RelationshipCategory } from '@/lib/relationshipTypes';
import type { PersonSummary } from '@/hooks/usePersonList';

export type CategoryFilter = RelationshipCategory | 'ALL';

export type PersonSort = 'stalest' | 'recent' | 'name-asc' | 'name-desc' | 'newest' | 'birthday';

/** The sorts the People page offers, in menu order. */
export const PERSON_SORTS: { value: PersonSort; label: string }[] = [
  { value: 'stalest', label: 'Longest since contact' },
  { value: 'recent', label: 'Most recently contacted' },
  { value: 'birthday', label: 'Upcoming birthday' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'newest', label: 'Recently added' },
];

export interface PersonListFilters {
  search: string;
  category: CategoryFilter;
  sort?: PersonSort;
  /** The day the birthday sort counts from; defaults to now. */
  today?: Date;
}

type Compare = (a: PersonSummary, b: PersonSummary) => number;

/** Oldest last_contacted_date first; never contacted counts as the stalest. */
const byStalest: Compare = (a, b) => {
  const aDate = a.last_contacted_date;
  const bDate = b.last_contacted_date;
  if (!aDate && !bDate) return 0;
  if (!aDate) return -1;
  if (!bDate) return 1;
  return aDate.localeCompare(bDate);
};

/** Newest last_contacted_date first; never contacted goes last. */
const byRecent: Compare = (a, b) => {
  const aDate = a.last_contacted_date;
  const bDate = b.last_contacted_date;
  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;
  return bDate.localeCompare(aDate);
};

const byName: Compare = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days from `today` to the next birthday (0 when it's today). `birthday` is an ISO date
 * (YYYY-MM-DD). A Feb 29 birthday falls on Mar 1 in other years, as Date rolls it over.
 */
function daysUntilBirthday(birthday: string, today: Date): number {
  const [, month, day] = birthday.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(start.getFullYear(), month - 1, day);
  if (next < start) next = new Date(start.getFullYear() + 1, month - 1, day);
  // Rounded so a daylight-saving change in between doesn't shift the count.
  return Math.round((next.getTime() - start.getTime()) / DAY_MS);
}

/** Soonest next birthday first; no birthday goes last. */
const byNextBirthday =
  (today: Date): Compare =>
  (a, b) => {
    if (!a.birthday && !b.birthday) return 0;
    if (!a.birthday) return 1;
    if (!b.birthday) return -1;
    return daysUntilBirthday(a.birthday, today) - daysUntilBirthday(b.birthday, today);
  };

function compareFor(sort: PersonSort, today: Date): Compare {
  switch (sort) {
    case 'stalest':
      return byStalest;
    case 'recent':
      return byRecent;
    case 'name-asc':
      return byName;
    case 'name-desc':
      return (a, b) => byName(b, a);
    case 'newest':
      return (a, b) => b.created_at.localeCompare(a.created_at);
    case 'birthday':
      return byNextBirthday(today);
  }
}

/** Filters by name and category, then sorts (stalest first unless `sort` says otherwise). */
export function filterAndSortPeople(
  people: PersonSummary[],
  { search, category, sort = 'stalest', today = new Date() }: PersonListFilters,
): PersonSummary[] {
  const query = search.trim().toLowerCase();

  return people
    .filter((p) => (query ? p.name.toLowerCase().includes(query) : true))
    .filter((p) => (category === 'ALL' ? true : p.relationship_category === category))
    .slice()
    .sort(compareFor(sort, today));
}
