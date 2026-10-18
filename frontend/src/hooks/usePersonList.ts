import { useQuery } from '@tanstack/react-query';
import { api, unwrap, type Person } from '@/api/client';

export type PersonSummary = Person;

export const peopleQueryKey = ['people'] as const;

export function usePersonList() {
  const query = useQuery({
    queryKey: peopleQueryKey,
    queryFn: () => unwrap(api.GET('/api/people')),
  });
  return { people: query.data ?? [], loading: query.isPending, error: query.error?.message ?? null };
}
