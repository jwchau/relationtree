import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, unwrap, type Person } from '@/api/client';

export type PersonSummary = Person;

export const peopleQueryKey = ['people'] as const;

/** Everyone in one tree. Waits until the tree is known. */
export const personListQuery = (treeId: string | undefined) =>
  queryOptions({
    queryKey: [...peopleQueryKey, 'tree', treeId],
    enabled: Boolean(treeId),
    queryFn: () => unwrap(api.GET('/api/people', { params: { query: { tree: treeId } } })),
  });

export function usePersonList(treeId: string | undefined) {
  const query = useQuery(personListQuery(treeId));
  return { people: query.data ?? [], loading: query.isPending, error: query.error?.message ?? null };
}
