import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { peopleQueryKey } from './usePersonList';

// Photo URLs in the graph expire after an hour, so it must go stale well before then
// (refetched on returning to the tab), and a tab left open refetches before they expire.
const GRAPH_STALE_MS = 30 * 60 * 1000;
const GRAPH_REFRESH_MS = 45 * 60 * 1000;

/** One tree's people and connections, for the map. Under ['people'] so person edits refresh
 * it, and connection edits invalidate it too, so a visit reuses it while it's fresh (it's the
 * biggest response: 816 kB for 1,000 people). */
export const treeGraphQuery = (treeId: string | undefined) =>
  queryOptions({
    queryKey: [...peopleQueryKey, 'graph', treeId],
    enabled: Boolean(treeId),
    staleTime: GRAPH_STALE_MS,
    refetchInterval: GRAPH_REFRESH_MS,
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/graph', { params: { path: { tree_id: treeId! } } })),
  });

export function useTreeGraph(treeId: string | undefined) {
  const query = useQuery(treeGraphQuery(treeId));
  return { graph: query.data ?? null, loading: query.isPending, error: query.error?.message ?? null };
}
