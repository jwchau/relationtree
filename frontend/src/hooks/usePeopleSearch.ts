import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { peopleQueryKey } from '@/hooks/usePersonList';

/**
 * Semantic search ("who do I know in finance?"). Keyed under ['people'] so any edit to a
 * person invalidates stale results. Runs only for a submitted, non-empty question.
 */
export function usePeopleSearch(question: string) {
  return useQuery({
    queryKey: [...peopleQueryKey, 'search', question],
    enabled: question.length > 0,
    queryFn: () => unwrap(api.GET('/api/people/search', { params: { query: { q: question } } })),
    // A 503 (AI down) won't fix itself in a second; let the user retry.
    retry: false,
  });
}
