import { PERSON_SORTS, type PersonSort } from '@/lib/personListFilters';

const STORAGE_KEY = 'relationtree.personSort';

// Remembering the sort is a convenience: without storage (private window, blocked site data),
// or with a value this version doesn't know, the People page uses the default sort.
export function readRememberedSort(): PersonSort | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return PERSON_SORTS.find((option) => option.value === stored)?.value ?? null;
  } catch {
    return null;
  }
}

export function rememberSort(sort: PersonSort) {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // Not remembered across reloads; nothing else to do.
  }
}
