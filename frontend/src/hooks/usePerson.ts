import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  api,
  unwrap,
  type Person,
  type PersonInput,
  type PersonPatch,
} from '@/api/client';
import { peopleQueryKey } from '@/hooks/usePersonList';

export type { Person };

export function usePerson(personId: string | undefined) {
  const query = useQuery({
    queryKey: [...peopleQueryKey, personId],
    enabled: Boolean(personId),
    queryFn: async (): Promise<Person | null> => {
      const { data, error, response } = await api.GET('/api/people/{person_id}', {
        params: { path: { person_id: personId! } },
      });
      if (response.status === 404) return null;
      if (error !== undefined || !data) throw new ApiError(response.status, 'Failed to load person');
      return data;
    },
  });
  return { person: query.data ?? null, loading: query.isPending, error: query.error?.message ?? null };
}

// Mutations invalidate the ['people'] prefix, which also refreshes every ['people', id] query.

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonInput) => unwrap(api.POST('/api/people', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}

export function useUpdatePerson(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonPatch) =>
      unwrap(
        api.PATCH('/api/people/{person_id}', { params: { path: { person_id: personId } }, body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}

export function useDeletePerson(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/api/people/{person_id}', { params: { path: { person_id: personId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}
