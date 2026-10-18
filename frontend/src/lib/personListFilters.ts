import type { RelationshipCategory } from '@/lib/relationshipTypes';
import type { PersonSummary } from '@/hooks/usePersonList';

export type CategoryFilter = RelationshipCategory | 'ALL';

export interface PersonListFilters {
  search: string;
  category: CategoryFilter;
}

/**
 * Sorts by last_contacted_date ascending; people never contacted (no date set)
 * are treated as the stalest and sort first.
 */
export function filterAndSortPeople(
  people: PersonSummary[],
  { search, category }: PersonListFilters,
): PersonSummary[] {
  const query = search.trim().toLowerCase();

  return people
    .filter((p) => (query ? p.name.toLowerCase().includes(query) : true))
    .filter((p) => (category === 'ALL' ? true : p.relationship_category === category))
    .slice()
    .sort((a, b) => {
      const aDate = a.last_contacted_date;
      const bDate = b.last_contacted_date;
      if (!aDate && !bDate) return 0;
      if (!aDate) return -1;
      if (!bDate) return 1;
      return aDate.localeCompare(bDate);
    });
}
